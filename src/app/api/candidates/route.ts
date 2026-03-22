import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  enforceQuotaRules,
  getCandidateLookupQuotaRules,
} from "@/lib/ai-quotas";

const anthropic = new Anthropic();

interface CandidateLookupResult {
  candidates: Array<{ name: string; party: string | null }>;
  error: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    typeof body.state === "string" && body.state.trim().length <= 100
      ? body.state.trim()
      : "";

  try {
    const quotaRules = getCandidateLookupQuotaRules();
    const quotaFailure = await enforceQuotaRules(
      supabase,
      quotaRules.map((rule) => ({ rule, incrementBy: 1 }))
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
              content: `List candidates for "${raceName}"${state ? ` in ${state}` : ""}. Search the web, then reply with ONLY a JSON array: [{"name":"...","party":"..."}]. Empty array if unknown.`,
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
