import { NextRequest } from "next/server";
import {
  isZaiConfigured,
  personalizeCandidateDossier,
  personalizeMeasureDossier,
  type ResearchRequest,
  type MeasureResearchRequest,
  runCandidateDossierResearch,
  runMeasureDossierResearch,
} from "@/lib/zai";
import type {
  ValuesProfile,
  BallotInput,
  CandidateDossier,
  CandidateResult,
  MeasureDossier,
  MeasureResult,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { getGuideAccessStatus } from "@/lib/billing";
import {
  enforceQuotaRules,
  getMaxResearchItems,
  getResearchQuotaRules,
  type QuotaResult,
} from "@/lib/ai-quotas";
import {
  isValidBallotInput,
  isValidCandidateDossier,
  isValidCandidateResult,
  isValidMeasureDossier,
  isValidMeasureResult,
  isValidValuesProfile,
} from "@/lib/validation";
import {
  sanitizeCandidateResult,
  sanitizeMeasureResult,
} from "@/lib/research-text";
import {
  buildBallotHash,
  buildResearchCacheKey,
  buildValuesProfileHash,
  loadResearchCache,
  saveResearchCache,
} from "@/lib/research-cache";
import {
  buildCandidateDossierKey,
  buildMeasureDossierKey,
  loadCandidateDossier,
  loadMeasureDossier,
  saveCandidateDossier,
  saveMeasureDossier,
} from "@/lib/research-dossiers";
import {
  buildCandidatePersonalizationCacheKey,
  buildMeasurePersonalizationCacheKey,
  loadCandidatePersonalizationCache,
  loadMeasurePersonalizationCache,
  saveCandidatePersonalizationCache,
  saveMeasurePersonalizationCache,
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

interface ResearchRequestBody {
  valuesProfile: ValuesProfile;
  ballotInput: BallotInput;
}

function validateRequest(body: unknown): body is ResearchRequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    isValidValuesProfile(b.valuesProfile) && isValidBallotInput(b.ballotInput)
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
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );
}

function getResearchConcurrency(): number {
  const parsed = Number.parseInt(
    process.env.RESEARCH_CONCURRENCY ?? "10",
    10
  );

  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(Math.max(parsed, 1), 12);
}

async function getCandidateDossier(
  req: ResearchRequest
): Promise<CandidateDossier> {
  const admin = createAdminClient();
  const cacheKey = buildCandidateDossierKey(req.candidate, req.race, req.state);

  if (admin) {
    const cached = await loadCandidateDossier(admin, cacheKey);
    if (cached && isValidCandidateDossier(cached)) {
      return cached;
    }
  }

  const dossier = await runCandidateDossierResearch(req);
  if (!isValidCandidateDossier(dossier)) {
    throw new Error("Candidate dossier returned an invalid result");
  }

  if (admin) {
    void saveCandidateDossier(
      admin,
      cacheKey,
      `${req.candidate.name} • ${req.race.name}`,
      req.state,
      dossier
    ).catch(() => {
      // Best-effort shared dossier cache only.
    });
  }

  return dossier;
}

async function getMeasureDossier(
  req: MeasureResearchRequest
): Promise<MeasureDossier> {
  const admin = createAdminClient();
  const cacheKey = buildMeasureDossierKey(req.measure, req.state);

  if (admin) {
    const cached = await loadMeasureDossier(admin, cacheKey);
    if (cached && isValidMeasureDossier(cached)) {
      return cached;
    }
  }

  const dossier = await runMeasureDossierResearch(req);
  if (!isValidMeasureDossier(dossier)) {
    throw new Error("Measure dossier returned an invalid result");
  }

  if (admin) {
    void saveMeasureDossier(
      admin,
      cacheKey,
      req.measure.title,
      req.state,
      dossier
    ).catch(() => {
      // Best-effort shared dossier cache only.
    });
  }

  return dossier;
}

// We stream results as newline-delimited JSON (NDJSON).
// Each line is one of:
//   { "type": "candidate_start", "candidateId": string, "name": string, "race": string }
//   { "type": "candidate_progress", "candidateId": string, "text": string }
//   { "type": "candidate_result", "candidateId": string, "result": CandidateResult }
//   { "type": "candidate_error", "candidateId": string, "error": string }
//   { "type": "done" }

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return new Response(
      JSON.stringify({ error: csrfError }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return new Response(
      JSON.stringify({ error: "Authentication is not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return new Response(
      JSON.stringify({ error: trust.reason }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!(await userHasCurrentAiConsent(supabase, user.id))) {
    return new Response(JSON.stringify(AI_CONSENT_REQUIRED_PAYLOAD), {
      status: AI_CONSENT_REQUIRED_STATUS,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!validateRequest(body)) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!isZaiConfigured()) {
    return new Response(
      JSON.stringify({ error: "Z.AI API key is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { valuesProfile, ballotInput } = body;
  const guideAccess = await getGuideAccessStatus(
    supabase,
    user,
    buildBallotHash(ballotInput)
  );

  if (!guideAccess.unlocked) {
    return new Response(
      JSON.stringify({
        error:
          "This ballot is not unlocked for full research yet. Use 1 Election Pass credit to unlock it first.",
        canUnlock: guideAccess.canUnlock,
        electionPassCredits: guideAccess.electionPassCredits,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const cacheKey = buildResearchCacheKey(valuesProfile, ballotInput);
  const admin = createAdminClient();
  const valuesProfileHash = buildValuesProfileHash(valuesProfile);

  const cached = await loadResearchCache(supabase, cacheKey);
  if (cached) {
    await recordAppEvent({
      category: "research",
      event: "research_cache_hit",
      route: "/api/research",
      userId: user.id,
      details: { cacheKey },
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        }

        for (const result of cached.results) {
          send({
            type: "candidate_start",
            candidateId: result.candidateId,
            name: result.name,
            race: result.race,
          });
          send({
            type: "candidate_result",
            candidateId: result.candidateId,
            result,
          });
        }

        for (const result of cached.measureResults) {
          send({
            type: "measure_start",
            measureId: result.measureId,
            title: result.title,
          });
          send({
            type: "measure_result",
            measureId: result.measureId,
            result,
          });
        }

        send({ type: "done" });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Collect all candidates across all races
  const researchItems: ResearchRequest[] = [];
  for (const race of ballotInput.races) {
    for (const candidate of race.candidates) {
      researchItems.push({
        candidate,
        race,
        state: ballotInput.state,
        profile: valuesProfile,
      });
    }
  }

  // Collect ballot measures
  const measureItems: MeasureResearchRequest[] = (
    ballotInput.measures ?? []
  ).map((measure) => ({
    measure,
    state: ballotInput.state,
    profile: valuesProfile,
  }));

  if (researchItems.length === 0 && measureItems.length === 0) {
    return new Response(
      JSON.stringify({ error: "No candidates or measures to research" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const totalItems = researchItems.length + measureItems.length;
  if (totalItems > getMaxResearchItems()) {
    return new Response(
      JSON.stringify({
        error:
          "This ballot is too large for a single research run. Reduce the number of candidates or measures and try again.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const cachedCandidateResults = new Map<string, CandidateResult>();
  const cachedMeasureResults = new Map<string, MeasureResult>();

  if (admin) {
    await Promise.all(
      researchItems.map(async (item) => {
        const dossierKey = buildCandidateDossierKey(
          item.candidate,
          item.race,
          item.state
        );
        const itemCacheKey = buildCandidatePersonalizationCacheKey({
          dossierKey,
          valuesProfileHash,
          mode: "full",
        });
        const cachedResult = await loadCandidatePersonalizationCache(
          admin,
          itemCacheKey
        );
        if (cachedResult && isValidCandidateResult(cachedResult)) {
          cachedCandidateResults.set(
            item.candidate.id,
            sanitizeCandidateResult({
              ...cachedResult,
              candidateId: item.candidate.id,
            })
          );
        }
      })
    );

    await Promise.all(
      measureItems.map(async (item) => {
        const dossierKey = buildMeasureDossierKey(item.measure, item.state);
        const itemCacheKey = buildMeasurePersonalizationCacheKey({
          dossierKey,
          valuesProfileHash,
        });
        const cachedResult = await loadMeasurePersonalizationCache(
          admin,
          itemCacheKey
        );
        if (cachedResult && isValidMeasureResult(cachedResult)) {
          cachedMeasureResults.set(
            item.measure.id,
            sanitizeMeasureResult({
              ...cachedResult,
              measureId: item.measure.id,
            })
          );
        }
      })
    );
  }

  const uncachedCandidateItems = researchItems.filter(
    (item) => !cachedCandidateResults.has(item.candidate.id)
  );
  const uncachedMeasureItems = measureItems.filter(
    (item) => !cachedMeasureResults.has(item.measure.id)
  );
  const missingItemCount =
    uncachedCandidateItems.length + uncachedMeasureItems.length;

  if (missingItemCount === 0) {
    await recordAppEvent({
      category: "research",
      event: "research_item_cache_hit",
      route: "/api/research",
      userId: user.id,
      details: { itemCount: totalItems },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        }

        for (const item of researchItems) {
          const result = cachedCandidateResults.get(item.candidate.id);
          if (!result) continue;
          send({
            type: "candidate_start",
            candidateId: result.candidateId,
            name: result.name,
            race: result.race,
          });
          send({
            type: "candidate_result",
            candidateId: result.candidateId,
            result,
          });
        }

        for (const item of measureItems) {
          const result = cachedMeasureResults.get(item.measure.id);
          if (!result) continue;
          send({
            type: "measure_start",
            measureId: result.measureId,
            title: result.title,
          });
          send({
            type: "measure_result",
            measureId: result.measureId,
            result,
          });
        }

        send({ type: "done" });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const quotaRules = getResearchQuotaRules(totalItems);
  let quotaFailure: QuotaResult | null;
  try {
    quotaFailure = await enforceQuotaRules(
      supabase,
      [
        { rule: quotaRules[0], incrementBy: 1 },
        { rule: quotaRules[1], incrementBy: missingItemCount },
      ]
    );
    const ipQuotaFailure = await enforceQuotaRules(
      supabase,
      buildScopedIpQuotaRules(request, quotaRules)
    );
    if (ipQuotaFailure) {
      quotaFailure = ipQuotaFailure;
    }
  } catch (err) {
    await recordAppEvent({
      category: "research",
      event: "research_quota_check_failed",
      severity: "error",
      route: "/api/research",
      userId: user.id,
      details: {
        message:
          err instanceof Error
            ? err.message
            : "Failed to enforce research quotas",
      },
    });
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : "Failed to enforce research quotas",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (quotaFailure) {
    await recordAppEvent({
      category: "research",
      event: "research_quota_reached",
      severity: "warning",
      route: "/api/research",
      userId: user.id,
      details: {
        scope: quotaFailure.scope,
        currentUnits: quotaFailure.currentUnits,
        maxUnits: quotaFailure.maxUnits,
      },
    });
    return new Response(
      JSON.stringify({
        error:
          "Research quota reached. Please wait before starting another run.",
        scope: quotaFailure.scope,
        currentUnits: quotaFailure.currentUnits,
        maxUnits: quotaFailure.maxUnits,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(quotaFailure.retryAfterSeconds),
        },
      }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      const collectedResults: CandidateResult[] = [];
      const collectedMeasureResults: MeasureResult[] = [];
      let hasFailures = false;

      for (const item of researchItems) {
        const cachedResult = cachedCandidateResults.get(item.candidate.id);
        if (!cachedResult) continue;

        send({
          type: "candidate_start",
          candidateId: cachedResult.candidateId,
          name: cachedResult.name,
          race: cachedResult.race,
        });
        send({
          type: "candidate_result",
          candidateId: cachedResult.candidateId,
          result: cachedResult,
        });
        collectedResults.push(cachedResult);
      }

      for (const item of measureItems) {
        const cachedResult = cachedMeasureResults.get(item.measure.id);
        if (!cachedResult) continue;

        send({
          type: "measure_start",
          measureId: cachedResult.measureId,
          title: cachedResult.title,
        });
        send({
          type: "measure_result",
          measureId: cachedResult.measureId,
          result: cachedResult,
        });
        collectedMeasureResults.push(cachedResult);
      }

      const candidateTasks = uncachedCandidateItems.map(
        (item) => async () => {
          const candidateId = item.candidate.id;
          const candidateName = item.candidate.name;
          const raceName = item.race.name;
          const dossierKey = buildCandidateDossierKey(
            item.candidate,
            item.race,
            item.state
          );
          const personalizationKey = buildCandidatePersonalizationCacheKey({
            dossierKey,
            valuesProfileHash,
            mode: "full",
          });

          send({
            type: "candidate_start",
            candidateId,
            name: candidateName,
            race: raceName,
          });

          try {
            send({
              type: "candidate_progress",
              candidateId,
              text: "Loading shared dossier...",
            });
            const dossier = await getCandidateDossier(item);
            send({
              type: "candidate_progress",
              candidateId,
              text: "Personalizing recommendation...",
            });
            const result = await personalizeCandidateDossier(item, dossier, "full");
            if (!isValidCandidateResult(result)) {
              hasFailures = true;
              send({
                type: "candidate_error",
                candidateId,
                error: "Candidate research returned an invalid result",
              });
              return;
            }

            const normalizedResult: CandidateResult = sanitizeCandidateResult({
              ...result,
              candidateId,
            });

            send({
              type: "candidate_result",
              candidateId,
              result: normalizedResult,
            });
            collectedResults.push(normalizedResult);
            if (admin) {
              void saveCandidatePersonalizationCache(
                admin,
                personalizationKey,
                `${candidateName} • ${raceName}`,
                normalizedResult
              ).catch(() => {
                // Best-effort shared result cache only.
              });
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Research failed";
            hasFailures = true;

            if (
              err instanceof Error &&
              "status" in err &&
              (err as { status: number }).status === 429
            ) {
              send({
                type: "candidate_error",
                candidateId,
                error:
                  "Rate limited by the AI service. Please try again in a moment.",
              });
            } else {
              send({
                type: "candidate_error",
                candidateId,
                error: message,
              });
            }
          }
        }
      );

      const measureTasks = uncachedMeasureItems.map(
        (item) => async () => {
          const measureId = item.measure.id;
          const measureTitle = item.measure.title;
          const dossierKey = buildMeasureDossierKey(item.measure, item.state);
          const personalizationKey = buildMeasurePersonalizationCacheKey({
            dossierKey,
            valuesProfileHash,
          });

          send({
            type: "measure_start",
            measureId,
            title: measureTitle,
          });

          try {
            send({
              type: "measure_progress",
              measureId,
              text: "Loading shared dossier...",
            });
            const dossier = await getMeasureDossier(item);
            send({
              type: "measure_progress",
              measureId,
              text: "Personalizing recommendation...",
            });
            const result = await personalizeMeasureDossier(item, dossier);
            if (!isValidMeasureResult(result)) {
              hasFailures = true;
              send({
                type: "measure_error",
                measureId,
                error: "Measure research returned an invalid result",
              });
              return;
            }

            const normalizedResult: MeasureResult = sanitizeMeasureResult({
              ...result,
              measureId,
            });

            send({
              type: "measure_result",
              measureId,
              result: normalizedResult,
            });
            collectedMeasureResults.push(normalizedResult);
            if (admin) {
              void saveMeasurePersonalizationCache(
                admin,
                personalizationKey,
                measureTitle,
                normalizedResult
              ).catch(() => {
                // Best-effort shared result cache only.
              });
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Research failed";
            hasFailures = true;
            send({ type: "measure_error", measureId, error: message });
          }
        }
      );

      const tasks = [...candidateTasks, ...measureTasks];
      await runWithConcurrencyLimit(tasks, getResearchConcurrency());

      if (
        !hasFailures &&
        collectedResults.length === researchItems.length &&
        collectedMeasureResults.length === measureItems.length
      ) {
        void saveResearchCache(supabase, user.id, cacheKey, {
          results: collectedResults,
          measureResults: collectedMeasureResults,
        }).catch(() => {
          // Best-effort server cache only.
        });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
