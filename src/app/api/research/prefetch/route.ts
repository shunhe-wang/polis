import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTrustStatus } from "@/lib/account-trust";
import type { BallotInput, CandidateDossier, MeasureDossier } from "@/lib/types";
import {
  runCandidateDossierResearch,
  runMeasureDossierResearch,
  type MeasureResearchRequest,
  type ResearchRequest,
} from "@/lib/anthropic";
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

  const body = await request.json().catch(() => null);
  if (!validateBody(body)) {
    return NextResponse.json(
      { error: "Invalid prefetch payload" },
      { status: 400 }
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

  for (const item of candidateItems) {
    tasks.push(async () => {
      const cacheKey = buildCandidateDossierKey(
        item.candidate,
        item.race,
        item.state
      );
      const cached = await loadCandidateDossier(admin, cacheKey);
      if (cached && isValidCandidateDossier(cached)) return;

      const requestBody: ResearchRequest = {
        candidate: item.candidate,
        race: item.race,
        state: item.state,
        profile,
      };
      const dossier: CandidateDossier = await runCandidateDossierResearch(
        requestBody
      );
      if (isValidCandidateDossier(dossier)) {
        await saveCandidateDossier(
          admin,
          cacheKey,
          `${item.candidate.name} • ${item.race.name}`,
          item.state,
          dossier
        );
      }
    });
  }

  for (const item of measureItems) {
    tasks.push(async () => {
      const cacheKey = buildMeasureDossierKey(item.measure, item.state);
      const cached = await loadMeasureDossier(admin, cacheKey);
      if (cached && isValidMeasureDossier(cached)) return;

      const requestBody: MeasureResearchRequest = {
        measure: item.measure,
        state: item.state,
        profile,
      };
      const dossier: MeasureDossier = await runMeasureDossierResearch(
        requestBody
      );
      if (isValidMeasureDossier(dossier)) {
        await saveMeasureDossier(
          admin,
          cacheKey,
          item.measure.title,
          item.state,
          dossier
        );
      }
    });
  }

  void runWithConcurrencyLimit(tasks, 2).catch(() => {
    // Best-effort shared dossier warming only.
  });

  return NextResponse.json({
    warmedCandidates: candidateItems.length,
    warmedMeasures: measureItems.length,
  });
}
