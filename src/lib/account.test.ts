import { afterEach, describe, expect, it } from "vitest";
import { getProEmails, getUserTierForEmail, isProEmail } from "@/lib/account";
import { canAccessFeature } from "@/lib/freemium";

describe("account tier helpers", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it("parses pro allowlists case-insensitively", () => {
    process.env.PRO_EMAILS = "pro@example.com, Beta@Example.com ";

    expect(getProEmails()).toEqual([
      "pro@example.com",
      "beta@example.com",
    ]);
    expect(isProEmail("PRO@example.com")).toBe(true);
    expect(isProEmail("other@example.com")).toBe(false);
  });

  it("maps guest, free, and pro tiers correctly", () => {
    process.env.PRO_EMAILS = "pro@example.com";

    expect(getUserTierForEmail(null)).toBe("guest");
    expect(getUserTierForEmail("free@example.com")).toBe("free");
    expect(getUserTierForEmail("pro@example.com")).toBe("pro");
  });

  it("gates starter analysis separately from full research", () => {
    expect(canAccessFeature("guest", "starter_analysis")).toBe(false);
    expect(canAccessFeature("free", "starter_analysis")).toBe(true);
    expect(canAccessFeature("free", "research")).toBe(false);
    expect(canAccessFeature("pro", "research")).toBe(true);
  });
});
