import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTrustStatus } from "@/lib/account-trust";
import type { BallotInput, CandidateDossier, MeasureDossier } from "@/lib/types";
import {
  isZaiConfigured,
  runCandidateDossierResearch,
  runMeasureDossierResearch,
  type MeasureResearchRequest,
  type ResearchRequest,
} from "@/lib/zai";
import {
  buildCandidateDossierKey,
  buildMeasureDossierKey,
  loadCandidateDossier,
  loadMeasureDossier,
  saveCandidateDossier,
  saveMeasureDossier,
} from "@/lib/research-dossiers";
import {
  isValidBallotInput,
  isValidCandidateDossier,
  isValidMeasureDossier,
} from "@/lib/validation";
import { createEmptyValuesProfile } from "@/lib/types";
import { getSameOriginError } from "@/lib/csrf";
import {
  AI_CONSENT_REQUIRED_PAYLOAD,
  AI_CONSENT_REQUIRED_STATUS,
  userHasCurrentAiConsent,
} from "@/lib/ai-consent";
import { enforceQuotaRules, getPrefetchQuotaRules } from "@/lib/ai-quotas";
import { buildScopedIpQuotaRules } from "@/lib/request-identity";
import { recordAppEvent } from "@/lib/observability";

export const maxDuration = 60;

interface PrefetchBody {
  ballotInput: BallotInput;
}

function validateBody(body: unknown): body is PrefetchBody {
  return (
    !!body &&
    typeof body === "object" &&
    "ballotInput" in body &&
    isValidBallotInput((body as { ballotInput: unknown }).ballotInput)
  );
}

async function runWithConcurrencyLimit(
  tasks: Array<() => Promise<void>>,
  limit: number
) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const taskIndex = nextIndex;
      nextIndex += 1;
      await tasks[taskIndex]();
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

function getPrefetchCandidateLimit(): number {
  return 2;
}

function getPrefetchMeasureLimit(): number {
  return 0;
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
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return NextResponse.json(
      { error: "Server configuration error" },
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

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return NextResponse.json({ error: trust.reason }, { status: 403 });
  }

  if (!(await userHasCurrentAiConsent(supabase, user.id))) {
    return NextResponse.json(AI_CONSENT_REQUIRED_PAYLOAD, {
      status: AI_CONSENT_REQUIRED_STATUS,
    });
  }

  const body = await request.json().catch(() => null);
  if (!validateBody(body)) {
    return NextResponse.json(
      { error: "Invalid prefetch payload" },
      { status: 400 }
    );
  }

  if (!isZaiConfigured()) {
    return NextResponse.json(
      { error: "Z.AI API key is not configured" },
      { status: 500 }
    );
  }

  const ballotInput = body.ballotInput;
  const state = ballotInput.state.trim();
  if (!state) {
    return NextResponse.json({ warmedCandidates: 0, warmedMeasures: 0 });
  }

  const profile = createEmptyValuesProfile();
  const candidateItems = ballotInput.races
    .flatMap((race) =>
      race.candidates.map((candidate) => ({
        candidate,
        race,
        state,
      }))
    )
    .slice(0, getPrefetchCandidateLimit());

  const measureItems = ballotInput.measures
    .map((measure) => ({ measure, state }))
    .slice(0, getPrefetchMeasureLimit());

  const tasks: Array<() => Promise<void>> = [];
  let warmedCandidates = 0;
  let warmedMeasures = 0;

  for (const item of candidateItems) {
    const cacheKey = buildCandidateDossierKey(
      item.candidate,
      item.race,
      item.state
    );
    const cached = await loadCandidateDossier(admin, cacheKey);
    if (cached && isValidCandidateDossier(cached)) continue;

    warmedCandidates += 1;
    tasks.push(async () => {
      const requestBody: ResearchRequest = {
        candidate: item.candidate,
        race: item.race,
        state: item.state,
        profile,
      };
      const dossier: CandidateDossier = await runCandidateDossierResearch(
        requestBody
      );
      if (!isValidCandidateDossier(dossier)) {
        throw new Error("Z.AI returned an invalid candidate dossier");
      }
      await saveCandidateDossier(
        admin,
        cacheKey,
        `${item.candidate.name} • ${item.race.name}`,
        item.state,
        dossier
      );
    });
  }

  for (const item of measureItems) {
    const cacheKey = buildMeasureDossierKey(item.measure, item.state);
    const cached = await loadMeasureDossier(admin, cacheKey);
    if (cached && isValidMeasureDossier(cached)) continue;

    warmedMeasures += 1;
    tasks.push(async () => {
      const requestBody: MeasureResearchRequest = {
        measure: item.measure,
        state: item.state,
        profile,
      };
      const dossier: MeasureDossier = await runMeasureDossierResearch(
        requestBody
      );
      if (!isValidMeasureDossier(dossier)) {
        throw new Error("Z.AI returned an invalid measure dossier");
      }
      await saveMeasureDossier(
        admin,
        cacheKey,
        item.measure.title,
        item.state,
        dossier
      );
    });
  }

  const itemUnits = tasks.length;
  if (itemUnits > 0) {
    const quotaRules = getPrefetchQuotaRules();
    let quotaFailure;
    try {
      quotaFailure = await enforceQuotaRules(supabase, [
        ...quotaRules.map((rule) => ({ rule, incrementBy: itemUnits })),
        ...buildScopedIpQuotaRules(request, quotaRules).map((entry) => ({
          ...entry,
          incrementBy: itemUnits,
        })),
      ]);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to enforce prefetch quota",
        },
        { status: 503 }
      );
    }

    if (quotaFailure) {
      return NextResponse.json(
        { error: "Research prefetch is rate limited right now." },
        {
          status: 429,
          headers: {
            "Retry-After": String(quotaFailure.retryAfterSeconds),
          },
        }
      );
    }

    try {
      await runWithConcurrencyLimit(tasks, 2);
    } catch (error) {
      await recordAppEvent({
        category: "research",
        event: "prefetch_failed",
        severity: "error",
        route: "/api/research/prefetch",
        userId: user.id,
        details: {
          itemUnits,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
      return NextResponse.json(
        { error: "Research prefetch failed." },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    warmedCandidates,
    warmedMeasures,
  });
}
