import { describe, expect, it } from "vitest";
import {
  sanitizeCandidateResult,
  sanitizeMeasureResult,
  sanitizeResearchText,
} from "@/lib/research-text";

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
