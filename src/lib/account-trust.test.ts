import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAccountTrustStatus,
  isDisposableEmailDomain,
} from "@/lib/account-trust";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("account trust", () => {
  it("detects disposable domains", () => {
    expect(isDisposableEmailDomain("test@mailinator.com")).toBe(true);
    expect(isDisposableEmailDomain("test@example.com")).toBe(false);
  });

  it("requires verified email when configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REQUIRE_VERIFIED_EMAIL", "true");
    vi.stubEnv("BLOCK_DISPOSABLE_EMAILS", "false");

    const status = getAccountTrustStatus({
      email: "voter@example.com",
      email_confirmed_at: undefined,
    });

    expect(status.trusted).toBe(false);
    expect(status.reason).toContain("Verify your email");
  });

  it("blocks disposable domains when configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REQUIRE_VERIFIED_EMAIL", "false");
    vi.stubEnv("BLOCK_DISPOSABLE_EMAILS", "true");

    const status = getAccountTrustStatus({
      email: "voter@mailinator.com",
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
    });

    expect(status.trusted).toBe(false);
    expect(status.reason).toContain("real email address");
  });
});
