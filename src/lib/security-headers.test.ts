import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildContentSecurityPolicy,
  getSecurityHeaders,
} from "@/lib/security-headers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("security headers", () => {
  it("includes a baseline CSP and frame protections", () => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");

    const headers = getSecurityHeaders();
    expect(headers.some((header) => header.key === "X-Frame-Options")).toBe(
      true
    );
  });

  it("allows unsafe-eval in development only", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildContentSecurityPolicy()).toContain("unsafe-eval");
  });
});
