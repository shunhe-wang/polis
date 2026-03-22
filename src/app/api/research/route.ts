import { NextRequest } from "next/server";
import {
  createResearchStream,
  createMeasureResearchStream,
  type ResearchRequest,
  type MeasureResearchRequest,
} from "@/lib/anthropic";
import type {
  ValuesProfile,
  BallotInput,
  CandidateResult,
  MeasureResult,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { getUserTierForEmail } from "@/lib/account";
import {
  enforceQuotaRules,
  getMaxResearchItems,
  getResearchQuotaRules,
  type QuotaResult,
} from "@/lib/ai-quotas";
import { canAccessFeature } from "@/lib/freemium";
import {
  isValidBallotInput,
  isValidCandidateResult,
  isValidMeasureResult,
  isValidValuesProfile,
} from "@/lib/validation";
import {
  sanitizeCandidateResult,
  sanitizeMeasureResult,
} from "@/lib/research-text";

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

// We stream results as newline-delimited JSON (NDJSON).
// Each line is one of:
//   { "type": "candidate_start", "candidateId": string, "name": string, "race": string }
//   { "type": "candidate_progress", "candidateId": string, "text": string }
//   { "type": "candidate_result", "candidateId": string, "result": CandidateResult }
//   { "type": "candidate_error", "candidateId": string, "error": string }
//   { "type": "done" }

export async function POST(request: NextRequest) {
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

  const tier = getUserTierForEmail(user.email);
  if (!canAccessFeature(tier, "research")) {
    return new Response(
      JSON.stringify({
        error:
          "Full-ballot personalized research is available on Pro. Free accounts can unlock one starter candidate analysis.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Anthropic API key is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { valuesProfile, ballotInput } = body;

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

  const quotaRules = getResearchQuotaRules(totalItems);
  let quotaFailure: QuotaResult | null;
  try {
    quotaFailure = await enforceQuotaRules(
      supabase,
      [
        { rule: quotaRules[0], incrementBy: 1 },
        { rule: quotaRules[1], incrementBy: totalItems },
      ]
    );
  } catch (err) {
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

      const candidateTasks = researchItems.map(
        (item) => async () => {
          const candidateId = item.candidate.id;
          const candidateName = item.candidate.name;
          const raceName = item.race.name;

          send({
            type: "candidate_start",
            candidateId,
            name: candidateName,
            race: raceName,
          });

          try {
            const stream = createResearchStream(item);
            let fullText = "";

            stream.on("text", (text) => {
              fullText += text;
              send({
                type: "candidate_progress",
                candidateId,
                text: fullText,
              });
            });

            const finalMessage = await stream.finalMessage();

            let responseText = "";
            for (const block of finalMessage.content) {
              if (block.type === "text") {
                responseText += block.text;
              }
            }

            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              send({
                type: "candidate_error",
                candidateId,
                error: "Could not parse candidate research results",
              });
              return;
            }

            const result = JSON.parse(jsonMatch[0]) as unknown;
            if (!isValidCandidateResult(result)) {
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
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Research failed";

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

      const measureTasks = measureItems.map(
        (item) => async () => {
          const measureId = item.measure.id;
          const measureTitle = item.measure.title;

          send({
            type: "measure_start",
            measureId,
            title: measureTitle,
          });

          try {
            const stream = createMeasureResearchStream(item);
            let fullText = "";

            stream.on("text", (text) => {
              fullText += text;
              send({
                type: "measure_progress",
                measureId,
                text: fullText,
              });
            });

            const finalMessage = await stream.finalMessage();

            let responseText = "";
            for (const block of finalMessage.content) {
              if (block.type === "text") {
                responseText += block.text;
              }
            }

            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              send({
                type: "measure_error",
                measureId,
                error: "Could not parse measure research results",
              });
              return;
            }

            const result = JSON.parse(jsonMatch[0]) as unknown;
            if (!isValidMeasureResult(result)) {
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
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Research failed";
            send({ type: "measure_error", measureId, error: message });
          }
        }
      );

      const tasks = [...candidateTasks, ...measureTasks];
      await runWithConcurrencyLimit(tasks, 3);
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
