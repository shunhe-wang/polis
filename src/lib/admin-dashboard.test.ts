import { describe, expect, it } from "vitest";
import { summarizeAdminOperations } from "./admin-dashboard";

describe("admin dashboard operations summary", () => {
  it("aggregates provider, research, billing, and error signals", () => {
    const summary = summarizeAdminOperations({
      totalUsers: 12,
      activeGuides: 7,
      configuredProUsers: 2,
      unfulfilledOrders: 1,
      events: [
        {
          category: "provider",
          event: "zai_request_succeeded",
          severity: "info",
          route: null,
          created_at: "2026-07-05T12:00:00.000Z",
          details: {
            durationMs: 1000,
            totalTokens: 200,
            promptTokens: 100,
            completionTokens: 100,
            webSearchUses: 1,
          },
        },
        {
          category: "provider",
          event: "zai_request_succeeded",
          severity: "info",
          route: null,
          created_at: "2026-07-05T12:01:00.000Z",
          details: {
            durationMs: 3000,
            totalTokens: 400,
            promptTokens: 200,
            completionTokens: 200,
            webSearchUses: 1,
          },
        },
        {
          category: "provider",
          event: "zai_request_failed",
          severity: "error",
          route: null,
          created_at: "2026-07-05T12:02:00.000Z",
          details: { message: "Provider unavailable" },
        },
        {
          category: "research",
          event: "starter_quota_reached",
          severity: "warning",
          route: "/api/starter-analysis",
          created_at: "2026-07-05T12:03:00.000Z",
          details: {},
        },
      ],
      orders: [
        { amount_total: 100, currency: "usd", status: "paid" },
        { amount_total: 100, currency: "usd", status: "paid" },
        { amount_total: 100, currency: "usd", status: "unpaid" },
      ],
      providerPricing: {
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 3,
        webSearchUsdPerUse: 0.01,
      },
    });

    expect(summary).toMatchObject({
      totalUsers: 12,
      activeGuides: 7,
      configuredProUsers: 2,
      researchEvents24h: 1,
      providerCalls24h: 3,
      providerErrors24h: 1,
      averageProviderLatencyMs: 2000,
      providerTokens24h: 600,
      estimatedProviderCostUsd24h: 0.0212,
      paidOrders24h: 2,
      grossRevenueCents24h: 200,
      unfulfilledOrders: 1,
      recordedQuotaDenials24h: 1,
    });
    expect(summary.recentErrors).toHaveLength(1);
    expect(summary.recentErrors[0].message).toBe("Provider unavailable");
  });
});
