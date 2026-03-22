import { describe, expect, it } from "vitest";
import {
  formatPartyDetail,
  formatPartyInline,
  getPartyAbbreviation,
} from "@/lib/party-format";

describe("party formatting", () => {
  it("abbreviates common party labels", () => {
    expect(getPartyAbbreviation("Democratic")).toBe("D");
    expect(getPartyAbbreviation("Republican")).toBe("R");
    expect(getPartyAbbreviation("Independent")).toBe("I");
    expect(getPartyAbbreviation("Green")).toBe("G");
    expect(getPartyAbbreviation("Libertarian")).toBe("L");
  });

  it("formats compact inline party labels", () => {
    expect(formatPartyInline("Democratic")).toBe("(D)");
    expect(formatPartyInline("Working Families")).toBe("(Working Families)");
  });

  it("formats detailed party labels for cards", () => {
    expect(formatPartyDetail("Democratic")).toBe("Democratic (D)");
    expect(formatPartyDetail("Independent")).toBe("Independent (I)");
  });
});
