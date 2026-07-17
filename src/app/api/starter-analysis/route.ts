import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  enforceStarterAnalysisQuota,
  getStarterAnalysisLimit,
  getStarterAnalysisIpQuotaRules,
  getStarterAnalysisRemaining,
  enforceQuotaRules,
  refundStarterAnalysisReservation,
} from "@/lib/ai-quotas";
import {
  isZaiConfigured,
  personalizeCandidateDossier,
  runCandidateDossierResearch,
} from "@/lib/zai";
import {
  sanitizeCandidateDossier,
  sanitizeCandidateResult,
} from "@/lib/research-text";
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
  AI_CONSENT_REQUIRED_PAYLOAD,
  AI_CONSENT_REQUIRED_STATUS,
  userHasCurrentAiConsent,
} from "@/lib/ai-consent";
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

  if (!(await userHasCurrentAiConsent(supabase, user.id))) {
    return NextResponse.json(AI_CONSENT_REQUIRED_PAYLOAD, {
      status: AI_CONSENT_REQUIRED_STATUS,
    });
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

  if (!isZaiConfigured()) {
    return NextResponse.json(
      { error: "Z.AI API key is not configured" },
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
        starterAnalysesRemaining: Math.max(
          0,
          getStarterAnalysisLimit() - 1
        ),
      });
    }

    return NextResponse.json(
      {
        error:
          "Your starter analysis is already tied to another candidate on this account.",
        starterAnalysesRemaining: 0,
        result: cachedResult,
      },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  let reservedStarter = false;
  const refundReservation = async () => {
    if (!reservedStarter || !admin) return;
    try {
      await refundStarterAnalysisReservation(admin, user.id);
    } catch {
      // Best-effort refund only; the persisted analysis row remains the
      // durable per-account gate.
    }
  };

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

    // Atomically reserve the free starter analysis before any paid AI work so
    // concurrent requests cannot all pass a read-only check and each receive a
    // free analysis. Failure paths refund the reservation so a failed AI call
    // never burns the user's single free analysis.
    const starterQuotaFailure = await enforceStarterAnalysisQuota(supabase);
    if (starterQuotaFailure) {
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
            "Your starter analysis has already been used for this account.",
          starterAnalysesRemaining: 0,
        },
        { status: 403 }
      );
    }
    reservedStarter = true;
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

  try {
    const researchRequest = {
      candidate: body.candidate,
      race: body.race,
      state: body.state,
      profile: body.valuesProfile,
    };
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
      dossier = sanitizeCandidateDossier(
        await runCandidateDossierResearch(researchRequest)
      );
      if (!isValidCandidateDossier(dossier)) {
        // One retry: GLM occasionally returns a structurally-off dossier. A
        // single retry recovers most transient cases before we give up.
        dossier = sanitizeCandidateDossier(
          await runCandidateDossierResearch(researchRequest)
        );
      }
      if (!isValidCandidateDossier(dossier)) {
        await recordAppEvent({
          category: "research",
          event: "starter_invalid_dossier",
          severity: "error",
          route: "/api/starter-analysis",
          userId: user.id,
        });
        await refundReservation();
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

    const sanitizePersonalized = (result: CandidateResult) =>
      sanitizeCandidateResult({ ...result, candidateId: body.candidate.id });

    let sanitizedResult =
      cachedPersonalized && isValidCandidateResult(cachedPersonalized)
        ? sanitizePersonalized(cachedPersonalized)
        : sanitizePersonalized(
            await personalizeCandidateDossier(
              researchRequest,
              dossier,
              "starter"
            )
          );

    if (!isValidCandidateResult(sanitizedResult)) {
      // One retry for transient malformed personalization output.
      sanitizedResult = sanitizePersonalized(
        await personalizeCandidateDossier(researchRequest, dossier, "starter")
      );
    }

    if (!isValidCandidateResult(sanitizedResult)) {
      await refundReservation();
      return NextResponse.json(
        { error: "Starter analysis returned an invalid result" },
        { status: 502 }
      );
    }

    const starterAnalysesRemaining =
      await getStarterAnalysisRemaining(supabase);

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
    await refundReservation();
    return NextResponse.json(
      { error: "Starter analysis is unavailable right now. Try again shortly." },
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
