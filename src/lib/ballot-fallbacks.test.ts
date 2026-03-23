import { describe, expect, it } from "vitest";
import {
  buildBallotFallbackLinks,
  getBallotSourceNotice,
} from "@/lib/ballot-fallbacks";

describe("ballot fallback links", () => {
  it("builds official and reference lookup links", () => {
    const links = buildBallotFallbackLinks({
      address: "123 Main St Alexandria VA",
      state: "VA",
      city: "Alexandria",
      county: "Alexandria City",
      election: {
        id: "1",
        name: "Virginia Democratic Primary",
        electionDay: "2026-06-10",
        kind: "primary",
        selectedParty: "Democrat",
      },
    });

    expect(links).toHaveLength(7);
    expect(links[0]?.label).toContain("USA.gov");
    expect(links.some((link) => link.url.includes("vote411.org"))).toBe(true);
    expect(
      links.some((link) => link.url.includes("Alexandria"))
    ).toBe(true);
  });

  it("returns a stronger warning when no ballot data is imported", () => {
    expect(getBallotSourceNotice(0, 0, null)).toContain("upload/paste the ballot");
    expect(getBallotSourceNotice(2, 0, null)).toContain("may miss local measures");
  });
});
