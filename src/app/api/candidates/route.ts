import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  enforceQuotaRules,
  getCandidateLookupQuotaRules,
} from "@/lib/ai-quotas";
import { getAccountTrustStatus } from "@/lib/account-trust";
import { getAccountPlan, getCurrentEntitlements } from "@/lib/billing";
import { canAccessFeature } from "@/lib/freemium";
import { buildScopedIpQuotaRules } from "@/lib/request-identity";
import { lookupGoogleCivicBallot } from "@/lib/ballot-sources/google-civic";
import {
  classifyDeterministicStatewideRace,
  findDeterministicStatewideCandidates,
} from "@/lib/deterministic-candidate-lookup";
import { getSameOriginError } from "@/lib/csrf";

const anthropic = new Anthropic();

interface CandidateLookupResult {
  candidates: Array<{ name: string; party: string | null }>;
  error: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json(
      { error: csrfError, candidates: [] },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication is not configured", candidates: [] },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Sign in to use automatic candidate lookup. You can still add candidates manually.",
        candidates: [],
      },
      { status: 401 }
    );
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return NextResponse.json(
      { error: trust.reason, candidates: [] },
      { status: 403 }
    );
  }

  const entitlements = await getCurrentEntitlements(supabase, user.id);
  const tier = getAccountPlan(user, entitlements).tier;
  if (!canAccessFeature(tier, "research")) {
    return NextResponse.json(
      {
        error:
          "Automatic candidate lookup is a paid feature. Free users can still add candidates manually.",
        candidates: [],
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.raceName !== "string" ||
    !body.raceName.trim() ||
    body.raceName.trim().length > 200
  ) {
    return NextResponse.json(
      { error: "A valid raceName is required", candidates: [] },
      { status: 400 }
    );
  }

  const raceName: string = body.raceName.trim();
  const state =
    typeof body.state === "string" && /^[A-Za-z]{2}$/.test(body.state.trim())
      ? body.state.trim().toUpperCase()
      : "";
  const locality =
    typeof body.locality === "string" && body.locality.trim().length <= 120
      ? body.locality.trim()
      : "";
  const address =
    typeof body.address === "string" && body.address.trim().length <= 300
      ? body.address.trim()
      : "";
  const electionId =
    typeof body.electionId === "string" && body.electionId.trim().length > 0
      ? body.electionId.trim()
      : null;

  if (!state) {
    return NextResponse.json(
      {
        error:
          "Candidate lookup needs a valid 2-letter state code so Polis can search the correct race.",
        candidates: [],
      },
      { status: 400 }
    );
  }

  try {
    const requestedDeterministicRace =
      classifyDeterministicStatewideRace(raceName);
    if (requestedDeterministicRace && address) {
      try {
        const civic = await lookupGoogleCivicBallot({ address, electionId });
        const deterministicCandidates = findDeterministicStatewideCandidates(
          civic.races,
          raceName
        );
        if (deterministicCandidates && deterministicCandidates.length > 0) {
          return NextResponse.json({
            candidates: deterministicCandidates.map((candidate) => ({
              name: candidate.name,
              party: candidate.party,
            })),
            error: null,
          } satisfies CandidateLookupResult);
        }
      } catch {
        // If the deterministic path fails, fall back to the paid AI lookup.
      }
    }

    const quotaRules = getCandidateLookupQuotaRules();
    const quotaFailure = await enforceQuotaRules(
      supabase,
      quotaRules.map((rule) => ({ rule, incrementBy: 1 }))
    );
    const ipQuotaFailure = await enforceQuotaRules(
      supabase,
      buildScopedIpQuotaRules(request, quotaRules)
    );

    if (quotaFailure) {
      return NextResponse.json(
        {
          error:
            "Automatic candidate lookup is rate limited right now. Please wait and try again, or add candidates manually.",
          candidates: [],
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(quotaFailure.retryAfterSeconds),
          },
        }
      );
    }
    if (ipQuotaFailure) {
      return NextResponse.json(
        {
          error:
            "Automatic candidate lookup is rate limited on this connection. Please wait and try again, or add candidates manually.",
          candidates: [],
        },
        { status: 429 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await anthropic.messages.create(
        {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          tools: [
            {
              type: "web_search_20250305" as const,
              name: "web_search" as const,
              max_uses: 2,
            },
          ],
          messages: [
            {
              role: "user",
              content: `List candidates for "${raceName}" in ${state}${locality ? `, ${locality}` : ""}. Restrict the search to the relevant election for that jurisdiction only. Search the web, then reply with ONLY a JSON array: [{"name":"...","party":"..."}]. Empty array if unknown.`,
            },
          ],
        },
        { signal: controller.signal }
      );

      // Extract text from response
      let text = "";
      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        }
      }

      // Parse the JSON array from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json({
          candidates: [],
          error: null,
        } satisfies CandidateLookupResult);
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        name: string;
        party?: string | null;
      }>;

      const candidates = parsed
        .filter((c) => c && typeof c.name === "string" && c.name.trim())
        .map((c) => ({
          name: c.name.trim(),
          party: c.party?.trim() || null,
        }));

      return NextResponse.json({
        candidates,
        error: null,
      } satisfies CandidateLookupResult);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    const isQuotaConfigError =
      err instanceof Error &&
      err.message.includes("AI quota functions are not installed");
    const message = isAbort
      ? "Candidate lookup timed out after 30 seconds"
      : err instanceof Error
        ? err.message
        : "Failed to look up candidates";
    return NextResponse.json(
      { candidates: [], error: message } satisfies CandidateLookupResult,
      { status: isAbort ? 504 : isQuotaConfigError ? 503 : 502 }
    );
  }
}
