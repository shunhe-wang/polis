import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNT_SUMMARY } from "@/lib/freemium";

describe("account summary shape", () => {
  it("defaults to a logged-out guest state", () => {
    expect(DEFAULT_ACCOUNT_SUMMARY).toEqual({
      isAuthenticated: false,
      trustedAccount: false,
      emailVerified: false,
      trustReason: null,
      starterAnalysesRemaining: 0,
      electionPassCredits: 0,
      checkoutConfigured: false,
    });
  });

  it("can represent a signed-in account with no credits", () => {
    const account = {
      ...DEFAULT_ACCOUNT_SUMMARY,
      isAuthenticated: true,
      trustedAccount: true,
      emailVerified: true,
      starterAnalysesRemaining: 1,
      checkoutConfigured: true,
    };

    expect(account.isAuthenticated).toBe(true);
    expect(account.electionPassCredits).toBe(0);
    expect(account.starterAnalysesRemaining).toBe(1);
  });

  it("can represent a signed-in account with credits available", () => {
    const account = {
      ...DEFAULT_ACCOUNT_SUMMARY,
      isAuthenticated: true,
      trustedAccount: true,
      emailVerified: true,
      electionPassCredits: 3,
      checkoutConfigured: true,
    };

    expect(account.electionPassCredits).toBe(3);
    expect(account.checkoutConfigured).toBe(true);
  });
});
