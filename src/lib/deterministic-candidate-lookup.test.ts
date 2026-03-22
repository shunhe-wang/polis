import { describe, expect, it } from "vitest";
import {
  classifyDeterministicStatewideRace,
  findDeterministicStatewideCandidates,
} from "@/lib/deterministic-candidate-lookup";
import type { Race } from "@/lib/types";

describe("deterministic candidate lookup", () => {
  it("classifies supported statewide race names", () => {
    expect(classifyDeterministicStatewideRace("US Senate - MI")).toBe(
      "us_senate"
    );
    expect(
      classifyDeterministicStatewideRace("United States Senator")
    ).toBe("us_senate");
    expect(classifyDeterministicStatewideRace("Governor - VA")).toBe(
      "governor"
    );
    expect(classifyDeterministicStatewideRace("Attorney General")).toBe(
      "attorney_general"
    );
    expect(classifyDeterministicStatewideRace("Secretary of State")).toBe(
      "secretary_of_state"
    );
    expect(classifyDeterministicStatewideRace("US House - District 7")).toBe(
      null
    );
  });

  it("returns candidates when there is one unambiguous statewide match", () => {
    const races: Race[] = [
      {
        id: "race-1",
        name: "United States Senator",
        level: "federal",
        candidates: [
          { id: "cand-1", name: "Jane Doe", party: "Democratic" },
          { id: "cand-2", name: "John Roe", party: "Republican" },
        ],
      },
    ];

    expect(findDeterministicStatewideCandidates(races, "US Senate - MI")).toEqual(
      races[0].candidates
    );
  });

  it("returns null instead of guessing when multiple statewide matches exist", () => {
    const races: Race[] = [
      {
        id: "race-1",
        name: "United States Senator",
        level: "federal",
        candidates: [{ id: "cand-1", name: "Jane Doe", party: "Democratic" }],
      },
      {
        id: "race-2",
        name: "United States Senator (Special Election)",
        level: "federal",
        candidates: [{ id: "cand-2", name: "John Roe", party: "Republican" }],
      },
    ];

    expect(findDeterministicStatewideCandidates(races, "US Senate")).toBeNull();
  });
});
