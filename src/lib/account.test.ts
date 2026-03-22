import { describe, expect, it } from "vitest";
import {
  getAccountPlan,
  hasPaidOverride,
  isPowerPassActive,
} from "@/lib/billing";
import { canAccessFeature } from "@/lib/freemium";

describe("account tier helpers", () => {
  it("maps guest, free, and pro tiers correctly", () => {
    expect(
      getAccountPlan(null, {
        election_pass_credits: 0,
        power_pass_runs_remaining: 0,
        power_pass_expires_at: null,
      }).tier
    ).toBe("guest");
    expect(
      getAccountPlan(
        { email: "free@example.com" },
        {
          election_pass_credits: 0,
          power_pass_runs_remaining: 0,
          power_pass_expires_at: null,
        }
      ).tier
    ).toBe("free");
    expect(
      getAccountPlan(
        { email: "paid@example.com" },
        {
          election_pass_credits: 1,
          power_pass_runs_remaining: 0,
          power_pass_expires_at: null,
        }
      ).tier
    ).toBe("pro");
  });

  it("treats active power passes as paid", () => {
    expect(
      isPowerPassActive({
        election_pass_credits: 0,
        power_pass_runs_remaining: 2,
        power_pass_expires_at: "2099-01-01T00:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isPowerPassActive({
        election_pass_credits: 0,
        power_pass_runs_remaining: 0,
        power_pass_expires_at: "2099-01-01T00:00:00.000Z",
      })
    ).toBe(false);
  });

  it("supports paid email overrides for local testing", () => {
    process.env.PRO_EMAILS = "override@example.com";
    expect(hasPaidOverride({ email: "override@example.com" })).toBe(true);
    expect(hasPaidOverride({ email: "free@example.com" })).toBe(false);
  });

  it("gates starter analysis separately from full research", () => {
    expect(canAccessFeature("guest", "starter_analysis")).toBe(false);
    expect(canAccessFeature("free", "starter_analysis")).toBe(true);
    expect(canAccessFeature("free", "research")).toBe(false);
    expect(canAccessFeature("pro", "research")).toBe(true);
  });
});
