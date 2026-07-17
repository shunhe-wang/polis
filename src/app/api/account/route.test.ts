import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, getAccountSummaryForUserMock, tokenClient } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    getAccountSummaryForUserMock: vi.fn(),
    tokenClient: { from: vi.fn() },
  })
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/lib/supabase/token", () => ({
  createAccessTokenClient: vi.fn(() => tokenClient),
}));
vi.mock("@/lib/account", () => ({
  getAccountSummaryForUser: getAccountSummaryForUserMock,
}));
vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/observability", () => ({ recordAppEvent: vi.fn() }));

import { GET, OPTIONS } from "./route";

describe("mobile account API", () => {
  beforeEach(() => {
    vi.stubEnv("MOBILE_APP_ORIGIN", "capacitor://localhost");
    getAccountSummaryForUserMock.mockResolvedValue({
      isAuthenticated: true,
      trustedAccount: true,
      emailVerified: true,
      trustReason: null,
      starterAnalysesRemaining: 1,
      electionPassCredits: 2,
      checkoutConfigured: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("accepts the configured Capacitor origin and bearer session", async () => {
    const user = { id: "user-1", email: "voter@example.com" };
    getUserMock.mockResolvedValue({ data: { user }, error: null });

    const response = await GET(
      new NextRequest("https://polis.example/api/account", {
        headers: {
          origin: "capacitor://localhost",
          authorization: "Bearer mobile-token",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "capacitor://localhost"
    );
    expect(await response.json()).toMatchObject({
      email: "voter@example.com",
      electionPassCredits: 2,
    });
    expect(getAccountSummaryForUserMock).toHaveBeenCalledWith(tokenClient, user);
  });

  it("rejects an invalid mobile bearer session", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    });

    const response = await GET(
      new NextRequest("https://polis.example/api/account", {
        headers: {
          origin: "capacitor://localhost",
          authorization: "Bearer invalid-token",
        },
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
  });

  it("answers valid mobile preflight requests", async () => {
    const response = await OPTIONS(
      new Request("https://polis.example/api/account", {
        method: "OPTIONS",
        headers: { origin: "capacitor://localhost" },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });
});
