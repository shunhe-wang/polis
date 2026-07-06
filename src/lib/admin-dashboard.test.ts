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
      appStoreTransactions: [
        { credits_granted: 1, fulfilled_at: "2026-07-05T11:00:00.000Z" },
        { credits_granted: 0, fulfilled_at: null },
      ],
      unfulfilledAppStoreTransactions: 1,
      providerPricing: {
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 3,
        webSearchUsdPerUse: 0.01,
      },
      latestElectionDataProbe: {
        category: "election_data",
        event: "election_data_probe_succeeded",
        severity: "info",
        route: "/api/cron/election-data-freshness",
        created_at: "2026-07-05T11:30:00.000Z",
        details: {
          hasBallot: true,
          raceCount: 4,
          measureCount: 1,
          durationMs: 850,
        },
      },
      now: new Date("2026-07-05T12:00:00.000Z"),
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
      appStorePurchases24h: 2,
      appStoreCreditsGranted24h: 1,
      unfulfilledAppStoreTransactions: 1,
      recordedQuotaDenials24h: 1,
      electionDataStatus: "healthy",
      latestElectionDataProbeAt: "2026-07-05T11:30:00.000Z",
      electionDataHasBallot: true,
      electionDataProbeLatencyMs: 850,
    });
    expect(summary.recentErrors).toHaveLength(1);
    expect(summary.recentErrors[0].message).toBe("Provider unavailable");
  });

  it("marks an old election-data probe as stale", () => {
    const summary = summarizeAdminOperations({
      totalUsers: 0,
      activeGuides: 0,
      configuredProUsers: 0,
      unfulfilledOrders: 0,
      events: [],
      orders: [],
      appStoreTransactions: [],
      unfulfilledAppStoreTransactions: 0,
      providerPricing: null,
      latestElectionDataProbe: {
        category: "election_data",
        event: "election_data_probe_succeeded",
        severity: "info",
        route: "/api/cron/election-data-freshness",
        created_at: "2026-07-03T12:00:00.000Z",
        details: { hasBallot: false, durationMs: 500 },
      },
      now: new Date("2026-07-05T12:00:00.000Z"),
    });

    expect(summary.electionDataStatus).toBe("stale");
  });
});
