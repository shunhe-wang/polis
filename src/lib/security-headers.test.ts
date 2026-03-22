import { afterEach, describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  getSecurityHeaders,
} from "@/lib/security-headers";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("security headers", () => {
  it("includes a baseline CSP and frame protections", () => {
    process.env.NODE_ENV = "production";
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
    process.env.NODE_ENV = "development";
    expect(buildContentSecurityPolicy()).toContain("unsafe-eval");
  });
});
