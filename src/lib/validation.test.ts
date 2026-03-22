import { describe, expect, it } from "vitest";
import { createEmptyValuesProfile, type BallotInput, type CandidateResult } from "@/lib/types";
import {
  isValidBallotInput,
  isValidCandidateResult,
  isValidValuesProfile,
} from "@/lib/validation";

describe("validation", () => {
  it("accepts a valid values profile", () => {
    const profile = {
      ...createEmptyValuesProfile(),
      freeText: "Housing affordability matters most to me.",
      politicalIdentity: "moderate" as const,
    };

    expect(isValidValuesProfile(profile)).toBe(true);
  });

  it("rejects out-of-range issue ratings", () => {
    const profile = createEmptyValuesProfile();
    profile.issueRatings.housing = 7;

    expect(isValidValuesProfile(profile)).toBe(false);
  });

  it("rejects invalid policy signal choices", () => {
    const profile = createEmptyValuesProfile();
    profile.policySignals.immigration_approach =
      "not-a-real-choice" as never;

    expect(isValidValuesProfile(profile)).toBe(false);
  });

  it("accepts a valid ballot input payload", () => {
    const ballot: BallotInput = {
      address: "123 Main St",
      state: "CA",
      races: [
        {
          id: "race-1",
          name: "Mayor",
          level: "local",
          candidates: [
            { id: "cand-1", name: "Alice Doe", party: "Independent" },
          ],
        },
      ],
      measures: [
        {
          id: "measure-1",
          title: "Measure A",
          description: "Builds affordable housing.",
          type: "initiative",
        },
      ],
    };

    expect(isValidBallotInput(ballot)).toBe(true);
  });

  it("rejects malformed candidate research results", () => {
    const result: CandidateResult = {
      candidateId: "cand-1",
      name: "Alice Doe",
      party: "Independent",
      race: "Mayor",
      alignmentScore: 85,
      issueBreakdown: [
        {
          issue: "housing",
          score: 90,
          summary: "Strong support for housing construction.",
          candidatePosition: "Supports zoning reform.",
          userPriority: 5,
        },
      ],
      likes: [
        {
          text: "Supports faster housing approvals.",
          sourceUrl: "https://example.com/like",
          sourceTitle: "Example",
        },
      ],
      concerns: [
        {
          text: "Limited education platform details.",
          sourceUrl: "https://example.com/concern",
          sourceTitle: "Example",
        },
      ],
      confidence: "medium",
      reasoning: "Mostly aligned.",
    };

    expect(isValidCandidateResult(result)).toBe(true);
    expect(
      isValidCandidateResult({ ...result, alignmentScore: 120 })
    ).toBe(false);
  });
});
