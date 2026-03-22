import { describe, expect, it } from "vitest";
import type { CandidateResult } from "@/lib/types";
import {
  buildRaceRecommendation,
  rankRaceCandidates,
} from "@/lib/race-recommendations";

function makeCandidate(input: {
  id: string;
  name: string;
  score: number;
  confidence?: CandidateResult["confidence"];
  economy?: number;
  housing?: number;
}): CandidateResult {
  return {
    candidateId: input.id,
    name: input.name,
    party: null,
    race: "Mayor",
    alignmentScore: input.score,
    confidence: input.confidence ?? "medium",
    reasoning: "Reasoning",
    likes: [],
    concerns: [],
    issueBreakdown: [
      {
        issue: "economy",
        score: input.economy ?? input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 5,
      },
      {
        issue: "housing",
        score: input.housing ?? input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 4,
      },
      {
        issue: "healthcare",
        score: input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 3,
      },
      {
        issue: "climate",
        score: input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 2,
      },
      {
        issue: "immigration",
        score: input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 2,
      },
      {
        issue: "civil_liberties",
        score: input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 2,
      },
      {
        issue: "foreign_policy",
        score: input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 1,
      },
      {
        issue: "education",
        score: input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 3,
      },
      {
        issue: "crypto_tech",
        score: input.score,
        summary: "",
        candidatePosition: "",
        userPriority: 1,
      },
    ],
  };
}

describe("race recommendations", () => {
  it("breaks headline-score ties using issue weighting and confidence", () => {
    const winner = makeCandidate({
      id: "cand-1",
      name: "Alice",
      score: 72,
      confidence: "high",
      economy: 78,
    });
    const runnerUp = makeCandidate({
      id: "cand-2",
      name: "Beth",
      score: 72,
      confidence: "medium",
      economy: 70,
    });

    const ranked = rankRaceCandidates([runnerUp, winner]);
    expect(ranked.recommended?.candidateId).toBe("cand-1");
    expect(ranked.explanation).toContain("gets the nod");
  });

  it("builds a single saved recommendation even in a close race", () => {
    const result = buildRaceRecommendation({
      raceId: "race-1",
      raceName: "Mayor",
      candidates: [
        makeCandidate({ id: "cand-1", name: "Alice", score: 72 }),
        makeCandidate({ id: "cand-2", name: "Beth", score: 72 }),
      ],
    });

    expect(result.recommendedCandidateId).not.toBeNull();
    expect(result.explanation.length).toBeGreaterThan(0);
  });
});
