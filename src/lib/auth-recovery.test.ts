import { describe, expect, it } from "vitest";
import {
  buildPasswordRecoveryRedirect,
  getSafeAuthRedirect,
} from "@/lib/auth-recovery";

describe("auth recovery", () => {
  it("builds the PKCE callback URL for the password reset page", () => {
    expect(buildPasswordRecoveryRedirect("https://polis.example")).toBe(
      "https://polis.example/auth/callback?next=%2Fauth%2Freset-password"
    );
  });

  it("allows only same-site relative callback destinations", () => {
    expect(getSafeAuthRedirect("/auth/reset-password")).toBe(
      "/auth/reset-password"
    );
    expect(getSafeAuthRedirect("https://evil.example")).toBe("/");
    expect(getSafeAuthRedirect("//evil.example")).toBe("/");
    expect(getSafeAuthRedirect("/\\evil.example")).toBe("/");
    expect(getSafeAuthRedirect("not-a-path")).toBe("/");
  });
});
