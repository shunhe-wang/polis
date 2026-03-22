import { describe, expect, it } from "vitest";
import {
  buildResult,
  inferMeasureType,
  isMeasureContest,
  isRaceContest,
  mapLevel,
} from "./route";

describe("civic route helpers", () => {
  it("maps contest levels to race levels", () => {
    expect(mapLevel(["country"])).toBe("federal");
    expect(mapLevel(["administrativeArea1"])).toBe("state");
    expect(mapLevel(["administrativeArea2"])).toBe("local");
  });

  it("treats office contests with candidates as races even if not General", () => {
    expect(
      isRaceContest({
        type: "Primary",
        office: "Mayor",
        candidates: [{ name: "Alice Doe" }],
      })
    ).toBe(true);
  });

  it("detects ballot measures from referendum metadata", () => {
    const contest = {
      type: "Referendum",
      referendumTitle: "Amendment 1",
      referendumText: "Protects voting rights.",
    };

    expect(isMeasureContest(contest)).toBe(true);
    expect(inferMeasureType(contest)).toBe("amendment");
  });

  it("builds races and measures from mixed contest payloads", () => {
    const result = buildResult({
      normalizedInput: {
        line1: "1 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62701",
      },
      contests: [
        {
          type: "Special Election",
          office: "Mayor",
          level: ["administrativeArea2"],
          candidates: [{ name: "Alice Doe", party: "Independent" }],
        },
        {
          type: "ballot-measure",
          referendumTitle: "Measure B",
          referendumText: "Funds schools.",
        },
      ],
    });

    expect(result.state).toBe("IL");
    expect(result.races).toHaveLength(1);
    expect(result.races[0].name).toBe("Mayor");
    expect(result.measures).toHaveLength(1);
    expect(result.measures[0].title).toBe("Measure B");
  });
});
