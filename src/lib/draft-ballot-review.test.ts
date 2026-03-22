import { describe, expect, it } from "vitest";
import type { BallotInput } from "@/lib/types";
import {
  removeDraftCandidate,
  removeDraftMeasure,
  removeDraftRace,
  updateDraftCandidateName,
  updateDraftCandidateParty,
  updateDraftMeasureDescription,
  updateDraftMeasureTitle,
  updateDraftRaceName,
} from "@/lib/draft-ballot-review";

const draft: BallotInput = {
  address: "",
  state: "VA",
  election: null,
  races: [
    {
      id: "race-1",
      name: "Mayor",
      level: "local",
      candidates: [
        { id: "cand-1", name: "Jane Doe", party: "Independent" },
        { id: "cand-2", name: "John Roe", party: "Democratic" },
      ],
    },
  ],
  measures: [
    {
      id: "measure-1",
      title: "Measure A",
      description: "Builds housing.",
      type: "initiative",
    },
  ],
};

describe("draft ballot review helpers", () => {
  it("updates race and candidate fields", () => {
    const updatedRace = updateDraftRaceName(draft, "race-1", "City Council");
    expect(updatedRace.races[0]?.name).toBe("City Council");

    const updatedCandidate = updateDraftCandidateName(
      draft,
      "race-1",
      "cand-1",
      "Janet Doe"
    );
    expect(updatedCandidate.races[0]?.candidates[0]?.name).toBe("Janet Doe");

    const updatedParty = updateDraftCandidateParty(
      draft,
      "race-1",
      "cand-2",
      "Republican"
    );
    expect(updatedParty.races[0]?.candidates[1]?.party).toBe("Republican");
  });

  it("removes races, candidates, and measures", () => {
    expect(removeDraftRace(draft, "race-1").races).toHaveLength(0);
    expect(removeDraftCandidate(draft, "race-1", "cand-1").races[0]?.candidates)
      .toHaveLength(1);
    expect(removeDraftMeasure(draft, "measure-1").measures).toHaveLength(0);
  });

  it("updates measure text", () => {
    const titled = updateDraftMeasureTitle(draft, "measure-1", "Amendment 1");
    expect(titled.measures[0]?.title).toBe("Amendment 1");

    const described = updateDraftMeasureDescription(
      draft,
      "measure-1",
      "Funds transit."
    );
    expect(described.measures[0]?.description).toBe("Funds transit.");
  });
});
