import { describe, expect, it } from "vitest";
import { getStateVotingPage } from "@/lib/state-voting-pages";

describe("state voting pages", () => {
  it("returns a state-specific Vote.gov page for known states", () => {
    expect(getStateVotingPage("va")).toEqual({
      label: "Virginia voting page (Vote.gov)",
      url: "https://vote.gov/register/virginia/",
    });
  });

  it("returns null for unknown state codes", () => {
    expect(getStateVotingPage("zz")).toBeNull();
    expect(getStateVotingPage(null)).toBeNull();
  });
});
