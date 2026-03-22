import { afterEach, describe, expect, it } from "vitest";
import {
  getCandidateLookupQuotaRules,
  getMaxResearchItems,
  getQuotaWindowStart,
  getResearchQuotaRules,
  getRetryAfterSeconds,
  getStarterAnalysisLimit,
  getStarterAnalysisWindowStart,
} from "@/lib/ai-quotas";
import { getAdminEmails, isAdminEmail } from "@/lib/admin";

describe("ai quota helpers", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it("rounds timestamps down to the quota window", () => {
    const date = new Date("2026-03-21T21:37:45.500Z");
    const windowStart = getQuotaWindowStart(date, 10 * 60 * 1000);

    expect(windowStart.toISOString()).toBe("2026-03-21T21:30:00.000Z");
  });

  it("computes retry-after within the current window", () => {
    const date = new Date("2026-03-21T21:37:45.000Z");

    expect(getRetryAfterSeconds(date, 10 * 60 * 1000)).toBe(135);
  });

  it("uses env overrides for quota configuration", () => {
    process.env.RESEARCH_REQUESTS_PER_10M = "5";
    process.env.RESEARCH_ITEMS_PER_DAY = "80";
    process.env.CANDIDATE_LOOKUPS_PER_DAY = "40";
    process.env.MAX_RESEARCH_ITEMS_PER_REQUEST = "9";
    process.env.FREE_STARTER_ANALYSES = "2";

    expect(getResearchQuotaRules(4)[0].maxUnits).toBe(5);
    expect(getResearchQuotaRules(4)[1].maxUnits).toBe(80);
    expect(getCandidateLookupQuotaRules()[1].maxUnits).toBe(40);
    expect(getMaxResearchItems()).toBe(9);
    expect(getStarterAnalysisLimit()).toBe(2);
    expect(getStarterAnalysisWindowStart().toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("parses admin allowlists case-insensitively", () => {
    process.env.ADMIN_EMAILS = "ADMIN@example.com, second@example.com ";

    expect(getAdminEmails()).toEqual([
      "admin@example.com",
      "second@example.com",
    ]);
    expect(isAdminEmail("admin@example.com")).toBe(true);
    expect(isAdminEmail("Admin@Example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
  });
});
