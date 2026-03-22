import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccountPlan, getCurrentEntitlements } from "@/lib/billing";
import {
  enforceStarterAnalysisQuota,
  getStarterAnalysisLimit,
  getStarterAnalysisIpQuotaRules,
  getStarterAnalysisRemaining,
  enforceQuotaRules,
} from "@/lib/ai-quotas";
import {
  personalizeCandidateDossier,
  runCandidateDossierResearch,
} from "@/lib/anthropic";
import { canAccessFeature } from "@/lib/freemium";
import { sanitizeCandidateResult } from "@/lib/research-text";
import { buildStarterAnalysisHashes } from "@/lib/research-cache";
import {
  buildCandidateDossierKey,
  loadCandidateDossier,
  saveCandidateDossier,
} from "@/lib/research-dossiers";
import {
  buildCandidatePersonalizationCacheKey,
  loadCandidatePersonalizationCache,
  saveCandidatePersonalizationCache,
} from "@/lib/research-item-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAppEvent } from "@/lib/observability";
import { getAccountTrustStatus } from "@/lib/account-trust";
import { buildScopedIpQuotaRules } from "@/lib/request-identity";
import { getSameOriginError } from "@/lib/csrf";
import {
  isValidCandidate,
  isValidCandidateDossier,
  isValidCandidateResult,
  isValidRace,
  isValidValuesProfile,
} from "@/lib/validation";
import type {
  Candidate,
  CandidateResult,
  Race,
  ValuesProfile,
} from "@/lib/types";

interface StarterAnalysisBody {
  valuesProfile: ValuesProfile;
  candidate: Candidate;
  race: Race;
  state: string;
}

function isValidStarterAnalysisBody(
  body: unknown
): body is StarterAnalysisBody {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  const candidate = value.candidate;
  const race = value.race;

  if (
    !isValidValuesProfile(value.valuesProfile) ||
    !isValidCandidate(candidate) ||
    !isValidRace(race) ||
    typeof value.state !== "string" ||
    value.state.length > 100
  ) {
    return false;
  }

  return race.candidates.some(
    (raceCandidate) => raceCandidate.id === candidate.id
  );
}

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json(
      { error: csrfError },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
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
          "Create a free account to unlock your starter candidate analysis.",
      },
      { status: 401 }
    );
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return NextResponse.json(
      { error: trust.reason ?? "This account cannot use starter analysis yet." },
      { status: 403 }
    );
  }

  const entitlements = await getCurrentEntitlements(supabase, user.id);
  const tier = getAccountPlan(user, entitlements).tier;
  if (!canAccessFeature(tier, "starter_analysis")) {
    return NextResponse.json(
      { error: "Starter analysis is not available for this account." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidStarterAnalysisBody(body)) {
    return NextResponse.json(
      { error: "Invalid starter analysis payload" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured" },
      { status: 500 }
    );
  }

  const ballotInput = {
    address: "",
    state: body.state,
    election: null,
    races: [body.race],
    measures: [],
  };
  const { valuesProfileHash, ballotHash } = buildStarterAnalysisHashes(
    body.valuesProfile,
    ballotInput
  );
  const { data: existingAnalysis } = await supabase
    .from("starter_candidate_analyses")
    .select("candidate_id, result")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingAnalysis) {
    const cachedResult = sanitizeCandidateResult(
      existingAnalysis.result as CandidateResult
    );
    if (existingAnalysis.candidate_id === body.candidate.id) {
      return NextResponse.json({
        result: cachedResult,
        starterAnalysesRemaining: tier === "free" ? 0 : getStarterAnalysisLimit(),
      });
    }

    if (tier === "free") {
      return NextResponse.json(
        {
          error:
            "Your free starter analysis is already tied to another candidate. Upgrade to unlock full-ballot research.",
          starterAnalysesRemaining: 0,
          result: cachedResult,
        },
        { status: 403 }
      );
    }
  }

  if (tier === "free") {
    try {
      const ipQuotaFailure = await enforceQuotaRules(
        supabase,
        buildScopedIpQuotaRules(request, getStarterAnalysisIpQuotaRules())
      );
      if (ipQuotaFailure) {
        return NextResponse.json(
          {
            error:
              "Starter analysis is temporarily rate limited on this connection. Try again later or sign in from your normal device.",
            starterAnalysesRemaining: await getStarterAnalysisRemaining(supabase),
          },
          { status: 429 }
        );
      }

      const quotaFailure = await enforceStarterAnalysisQuota(supabase);
      if (quotaFailure) {
        await recordAppEvent({
          category: "research",
          event: "starter_quota_reached",
          severity: "warning",
          route: "/api/starter-analysis",
          userId: user.id,
        });
        return NextResponse.json(
          {
            error:
              "Your free starter analysis has already been used. Upgrade to unlock full-ballot research.",
            starterAnalysesRemaining: 0,
          },
          { status: 403 }
        );
      }
    } catch (error) {
      await recordAppEvent({
        category: "research",
        event: "starter_quota_failed",
        severity: "error",
        route: "/api/starter-analysis",
        userId: user.id,
        details: {
          message:
            error instanceof Error
              ? error.message
              : "Failed to enforce starter analysis quota",
        },
      });
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to enforce starter analysis quota",
        },
        { status: 503 }
      );
    }
  }

  try {
    const researchRequest = {
      candidate: body.candidate,
      race: body.race,
      state: body.state,
      profile: body.valuesProfile,
    };
    const admin = createAdminClient();
    const dossierKey = buildCandidateDossierKey(
      body.candidate,
      body.race,
      body.state
    );
    const personalizationKey = buildCandidatePersonalizationCacheKey({
      dossierKey,
      valuesProfileHash,
      mode: "starter",
    });

    let dossier = admin
      ? await loadCandidateDossier(admin, dossierKey)
      : null;

    if (!dossier || !isValidCandidateDossier(dossier)) {
      dossier = await runCandidateDossierResearch(researchRequest);
      if (!isValidCandidateDossier(dossier)) {
        await recordAppEvent({
          category: "research",
          event: "starter_invalid_dossier",
          severity: "error",
          route: "/api/starter-analysis",
          userId: user.id,
        });
        return NextResponse.json(
          { error: "Starter analysis returned an invalid dossier" },
          { status: 502 }
        );
      }

      if (admin) {
        void saveCandidateDossier(
          admin,
          dossierKey,
          `${body.candidate.name} • ${body.race.name}`,
          body.state,
          dossier
        ).catch(() => {
          // Best-effort shared dossier cache only.
        });
      }
    }

    const cachedPersonalized = admin
      ? await loadCandidatePersonalizationCache(admin, personalizationKey)
      : null;
    const result =
      cachedPersonalized && isValidCandidateResult(cachedPersonalized)
        ? cachedPersonalized
        : await personalizeCandidateDossier(
            researchRequest,
            dossier,
            "starter"
          );

    const sanitizedResult = sanitizeCandidateResult({
      ...result,
      candidateId: body.candidate.id,
    });

    if (!isValidCandidateResult(sanitizedResult)) {
      return NextResponse.json(
        { error: "Starter analysis returned an invalid result" },
        { status: 502 }
      );
    }

    const starterAnalysesRemaining =
      tier === "free"
        ? await getStarterAnalysisRemaining(supabase)
        : getStarterAnalysisLimit();

    if (admin && (!cachedPersonalized || !isValidCandidateResult(cachedPersonalized))) {
      void saveCandidatePersonalizationCache(
        admin,
        personalizationKey,
        `${body.candidate.name} • ${body.race.name} • starter`,
        sanitizedResult
      ).catch(() => {
        // Best-effort shared result cache only.
      });
    }

    await supabase.from("starter_candidate_analyses").upsert(
      {
        user_id: user.id,
        candidate_id: body.candidate.id,
        candidate_name: body.candidate.name,
        race_id: body.race.id,
        race_name: body.race.name,
        values_profile_hash: valuesProfileHash,
        ballot_hash: ballotHash,
        result: sanitizedResult,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return NextResponse.json({
      result: sanitizedResult,
      starterAnalysesRemaining,
    });
  } catch (error) {
    await recordAppEvent({
      category: "research",
      event: "starter_analysis_failed",
      severity: "error",
      route: "/api/starter-analysis",
      userId: user.id,
      details: {
        message:
          error instanceof Error ? error.message : "Starter analysis failed",
      },
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Starter analysis failed",
      },
      { status: 502 }
    );
  }
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const { data } = await supabase
    .from("starter_candidate_analyses")
    .select("result")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    result: data?.result ? sanitizeCandidateResult(data.result as CandidateResult) : null,
  });
}
