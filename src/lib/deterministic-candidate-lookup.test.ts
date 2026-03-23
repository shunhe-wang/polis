import { describe, expect, it } from "vitest";
import {
  classifyDeterministicOfficeRace,
  findDeterministicCandidates,
  isDeterministicOfficeLookup,
} from "@/lib/deterministic-candidate-lookup";
import type { Race } from "@/lib/types";

describe("deterministic candidate lookup", () => {
  it("classifies supported office race names", () => {
    expect(classifyDeterministicOfficeRace("US Senate - MI")).toBe("us_senate");
    expect(classifyDeterministicOfficeRace("United States Representative", "federal")).toBe(
      "us_house"
    );
    expect(classifyDeterministicOfficeRace("Governor - VA")).toBe("governor");
    expect(classifyDeterministicOfficeRace("Attorney General")).toBe(
      "attorney_general"
    );
    expect(classifyDeterministicOfficeRace("Secretary of State")).toBe(
      "secretary_of_state"
    );
    expect(classifyDeterministicOfficeRace("Mayor")).toBe("mayor");
    expect(classifyDeterministicOfficeRace("City Council - Ward 2")).toBe(
      "city_council"
    );
    expect(classifyDeterministicOfficeRace("Board of Education District 4")).toBe(
      "school_board"
    );
    expect(isDeterministicOfficeLookup("US House - District 7")).toBe(true);
    expect(isDeterministicOfficeLookup("Parks Commissioner")).toBe(false);
  });

  it("returns candidates when there is one exact race-name match", () => {
    const races: Race[] = [
      {
        id: "race-1",
        name: "Mayor of Alexandria",
        level: "local",
        candidates: [
          { id: "cand-1", name: "Jane Doe", party: "Democratic" },
          { id: "cand-2", name: "John Roe", party: "Republican" },
        ],
      },
    ];

    expect(findDeterministicCandidates(races, "Mayor of Alexandria")).toEqual(
      races[0].candidates
    );
  });

  it("returns candidates when a single office-type match exists", () => {
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

    expect(findDeterministicCandidates(races, "US Senate - MI")).toEqual(
      races[0].candidates
    );
  });

  it("uses qualifiers to resolve district races", () => {
    const races: Race[] = [
      {
        id: "race-1",
        name: "United States Representative District 7",
        level: "federal",
        candidates: [{ id: "cand-1", name: "Jane Doe", party: "Democratic" }],
      },
      {
        id: "race-2",
        name: "United States Representative District 8",
        level: "federal",
        candidates: [{ id: "cand-2", name: "John Roe", party: "Republican" }],
      },
    ];

    expect(findDeterministicCandidates(races, "US House - District 7")).toEqual(
      races[0].candidates
    );
  });

  it("returns null instead of guessing when multiple office matches exist", () => {
    const races: Race[] = [
      {
        id: "race-1",
        name: "City Council Ward 1",
        level: "local",
        candidates: [{ id: "cand-1", name: "Jane Doe", party: "Democratic" }],
      },
      {
        id: "race-2",
        name: "City Council Ward 2",
        level: "local",
        candidates: [{ id: "cand-2", name: "John Roe", party: "Republican" }],
      },
    ];

    expect(findDeterministicCandidates(races, "City Council")).toBeNull();
  });
});
