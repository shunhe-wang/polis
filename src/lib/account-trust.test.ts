import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAccountTrustStatus,
  isDisposableEmailDomain,
} from "@/lib/account-trust";

const originalEnv = {
  REQUIRE_VERIFIED_EMAIL: process.env.REQUIRE_VERIFIED_EMAIL,
  BLOCK_DISPOSABLE_EMAILS: process.env.BLOCK_DISPOSABLE_EMAILS,
};

afterEach(() => {
  process.env.REQUIRE_VERIFIED_EMAIL = originalEnv.REQUIRE_VERIFIED_EMAIL;
  process.env.BLOCK_DISPOSABLE_EMAILS = originalEnv.BLOCK_DISPOSABLE_EMAILS;
  vi.unstubAllEnvs();
});

describe("account trust", () => {
  it("detects disposable domains", () => {
    expect(isDisposableEmailDomain("test@mailinator.com")).toBe(true);
    expect(isDisposableEmailDomain("test@example.com")).toBe(false);
  });

  it("requires verified email when configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.REQUIRE_VERIFIED_EMAIL = "true";
    process.env.BLOCK_DISPOSABLE_EMAILS = "false";

    const status = getAccountTrustStatus({
      email: "voter@example.com",
      email_confirmed_at: null,
    });

    expect(status.trusted).toBe(false);
    expect(status.reason).toContain("Verify your email");
  });

  it("blocks disposable domains when configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.REQUIRE_VERIFIED_EMAIL = "false";
    process.env.BLOCK_DISPOSABLE_EMAILS = "true";

    const status = getAccountTrustStatus({
      email: "voter@mailinator.com",
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
    });

    expect(status.trusted).toBe(false);
    expect(status.reason).toContain("real email address");
  });
});
