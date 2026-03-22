import { describe, expect, it } from "vitest";
import { buildCandidateSourceLinks } from "@/lib/candidate-links";

describe("candidate source links", () => {
  it("builds stable search links for a candidate and race", () => {
    const links = buildCandidateSourceLinks(
      { id: "cand-1", name: "Jane Smith", party: "Independent" },
      "Mayor",
      "CA"
    );

    expect(links).toHaveLength(4);
    expect(links[0].url).toContain("Jane%20Smith");
    expect(links[0].url).toContain("Mayor");
    expect(links[1].url).toContain("tbm=nws");
    expect(links[2].url).toContain("ballotpedia.org");
    expect(links[3].url).toContain("campaign%20official%20site");
  });
});
