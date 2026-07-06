import { describe, expect, it } from "vitest";
import {
  sanitizeCandidateDossier,
  sanitizeCandidateResult,
  sanitizeMeasureResult,
  sanitizeResearchText,
} from "@/lib/research-text";
import { isValidCandidateDossier } from "@/lib/validation";

describe("research text sanitization", () => {
  it("removes cite tags and inline citation markers", () => {
    expect(
      sanitizeResearchText(
        'A claim <cite index="1-2,1-3">with tags</cite> and [12-3] refs.'
      )
    ).toBe("A claim with tags and refs.");
  });

  it("sanitizes candidate reasoning and bullets", () => {
    const result = sanitizeCandidateResult({
      candidateId: "cand-1",
      name: "Jane Doe",
      party: "Independent",
      race: "Mayor",
      alignmentScore: 74,
      issueBreakdown: [
        {
          issue: "housing",
          score: 80,
          summary: 'Supports more housing <cite index="1-1">per local plan</cite>.',
          candidatePosition: "Backs zoning reform [2-2].",
          userPriority: 5,
        },
      ],
      likes: [
        {
          text: 'Supports faster permits <cite index="3-1">here</cite>.',
          sourceUrl: "https://example.com",
          sourceTitle: "Example <cite index=\"3-1\">Source</cite>",
        },
      ],
      concerns: [
        {
          text: "Tax plan is vague [3-2].",
          sourceUrl: "https://example.com/2",
          sourceTitle: "Example 2",
        },
      ],
      confidence: "medium",
      reasoning: 'This is broken <cite index="2-1">text</cite> [4-1].',
    });

    expect(result.reasoning).toBe("This is broken text.");
    expect(result.likes[0].text).toBe("Supports faster permits here.");
    expect(result.issueBreakdown[0].candidatePosition).toBe(
      "Backs zoning reform."
    );
  });

  it("drops candidate likes and concerns that lack a usable source", () => {
    const result = sanitizeCandidateResult({
      candidateId: "cand-1",
      name: "Jane Doe",
      party: null,
      race: "Mayor",
      alignmentScore: 50,
      issueBreakdown: [],
      likes: [
        {
          text: "Sourced strength.",
          sourceUrl: "https://example.com",
          sourceTitle: "Example",
        },
        { text: "No source here.", sourceUrl: "", sourceTitle: "" },
      ],
      concerns: [
        { text: "Missing source.", sourceUrl: "  ", sourceTitle: "Anon" },
      ],
      confidence: "low",
      reasoning: "Limited information available.",
    });

    expect(result.likes).toHaveLength(1);
    expect(result.likes[0].text).toBe("Sourced strength.");
    expect(result.concerns).toHaveLength(0);
  });

  it("salvages a thin-source dossier into a valid one instead of failing", () => {
    const sanitized = sanitizeCandidateDossier({
      name: "Robert Steadman",
      party: "Republican",
      race: "US Senate - DC",
      state: "DC",
      overview: "No credible information was found for this candidate.",
      issueEvidence: [
        {
          issue: "economy",
          summary: "No information found.",
          stance: "Unknown - no available evidence",
        },
      ],
      strengths: [
        {
          text: "No verifiable strengths could be identified.",
          sourceUrl: "",
          sourceTitle: "No sources available",
        },
      ],
      concerns: [
        {
          text: "A real sourced concern.",
          sourceUrl: "https://example.gov",
          sourceTitle: "Gov source",
        },
      ],
      confidence: "low",
    });

    expect(sanitized.strengths).toHaveLength(0);
    expect(sanitized.concerns).toHaveLength(1);
    expect(isValidCandidateDossier(sanitized)).toBe(true);
  });

  it("sanitizes measure summaries and analysis", () => {
    const result = sanitizeMeasureResult({
      measureId: "measure-1",
      title: "Measure A",
      summary: 'Summary <cite index="1-1">text</cite>.',
      alignmentScore: 60,
      prosForVoter: [
        {
          text: "Could fund schools [1-2].",
          sourceUrl: "https://example.com",
          sourceTitle: "Source",
        },
      ],
      consForVoter: [
        {
          text: 'Raises costs <cite index="1-3">maybe</cite>.',
          sourceUrl: "https://example.com/2",
          sourceTitle: "Source 2",
        },
      ],
      recommendation: "yes",
      confidence: "medium",
      reasoning: 'Reasoning <cite index="1-4">text</cite>.',
    });

    expect(result.summary).toBe("Summary text.");
    expect(result.consForVoter[0].text).toBe("Raises costs maybe.");
    expect(result.reasoning).toBe("Reasoning text.");
  });
});
