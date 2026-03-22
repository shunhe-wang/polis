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

interface ResearchRequestBody {
  valuesProfile: ValuesProfile;
  ballotInput: BallotInput;
}

function validateRequest(body: unknown): body is ResearchRequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!b.valuesProfile || typeof b.valuesProfile !== "object") return false;
  if (!b.ballotInput || typeof b.ballotInput !== "object") return false;
  return true;
}

// We stream results as newline-delimited JSON (NDJSON).
// Each line is one of:
//   { "type": "candidate_start", "candidateId": string, "name": string, "race": string }
//   { "type": "candidate_progress", "candidateId": string, "text": string }
//   { "type": "candidate_result", "candidateId": string, "result": CandidateResult }
//   { "type": "candidate_error", "candidateId": string, "error": string }
//   { "type": "done" }

export async function POST(request: NextRequest) {
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      // Research all candidates in parallel
      const promises = researchItems.map(async (item) => {
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

          // Extract text from the response
          let responseText = "";
          for (const block of finalMessage.content) {
            if (block.type === "text") {
              responseText += block.text;
            }
          }

          // Parse the JSON result
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            send({
              type: "candidate_error",
              candidateId,
              error: "Could not parse candidate research results",
            });
            return;
          }

          const result: CandidateResult = JSON.parse(jsonMatch[0]);
          // Ensure candidateId matches
          result.candidateId = candidateId;

          send({ type: "candidate_result", candidateId, result });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Research failed";

          // Handle rate limits specifically
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
      });

      // Research ballot measures in parallel too
      const measurePromises = measureItems.map(async (item) => {
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

          const result: MeasureResult = JSON.parse(jsonMatch[0]);
          result.measureId = measureId;

          send({ type: "measure_result", measureId, result });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Research failed";
          send({ type: "measure_error", measureId, error: message });
        }
      });

      await Promise.all([...promises, ...measurePromises]);
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
