import { describe, expect, it } from "vitest";
import {
  getBallotDraftImportMessage,
  getBallotDraftQuality,
  getBallotDraftQualityLabel,
  getBallotDraftReviewHint,
  getFriendlyBallotDraftParseError,
  normalizeBallotReviewDraft,
} from "@/lib/ballot-draft-quality";

describe("ballot draft quality helpers", () => {
  it("normalizes noisy draft content and adds derived notes", () => {
    const normalized = normalizeBallotReviewDraft({
      election: {
        name: "  Virginia General Election  ",
        electionDay: "2026-11-03",
        kind: "general",
        selectedParty: null,
      },
      races: [
        {
          name: " Mayor ",
          level: "local",
          contestType: " General ",
          candidates: [
            { name: " Jane Doe ", party: " Democrat " },
            { name: "Jane Doe", party: "Democrat" },
            { name: "", party: null },
          ],
        },
      ],
      measures: [],
      confidence: 48,
      notes: ["  Candidate names may be incomplete.  "],
    });

    expect(normalized.races[0]?.name).toBe("Mayor");
    expect(normalized.races[0]?.candidates).toHaveLength(1);
    expect(normalized.notes).toContain("Candidate names may be incomplete.");
  });

  it("classifies draft quality and labels", () => {
    expect(getBallotDraftQuality(85)).toBe("high");
    expect(getBallotDraftQuality(60)).toBe("medium");
    expect(getBallotDraftQuality(20)).toBe("low");
    expect(getBallotDraftQualityLabel(20)).toBe("Low-confidence draft");
  });

  it("returns stronger review hints for low-confidence drafts", () => {
    expect(
      getBallotDraftReviewHint({
        confidence: 25,
        races: [],
        measures: [],
      })
    ).toContain("could not confidently read this ballot");
  });

  it("builds source-aware import messages", () => {
    expect(
      getBallotDraftImportMessage("uploaded_file", {
        confidence: 45,
        races: [{ name: "Mayor", level: "local", contestType: null, candidates: [] }],
        measures: [],
      })
    ).toContain("low-confidence");
  });

  it("maps parsing failures to user-facing errors", () => {
    expect(
      getFriendlyBallotDraftParseError(
        new Error("No races or measures were confidently extracted"),
        "file"
      )
    ).toContain("could not confidently find races or measures");
  });
});
