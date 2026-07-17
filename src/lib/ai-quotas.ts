import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuotaRule {
  scope: string;
  windowMs: number;
  maxUnits: number;
}

export interface QuotaResult {
  allowed: boolean;
  scope: string;
  currentUnits: number;
  maxUnits: number;
  retryAfterSeconds: number;
}

const STARTER_ANALYSIS_SCOPE = "starter_candidate_analysis_lifetime";
const STARTER_ANALYSIS_WINDOW_START = "2026-01-01T00:00:00.000Z";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getQuotaWindowStart(date: Date, windowMs: number): Date {
  return new Date(Math.floor(date.getTime() / windowMs) * windowMs);
}

export function getRetryAfterSeconds(date: Date, windowMs: number): number {
  const windowStart = getQuotaWindowStart(date, windowMs).getTime();
  return Math.max(1, Math.ceil((windowStart + windowMs - date.getTime()) / 1000));
}

export function getResearchQuotaRules(itemUnits: number): QuotaRule[] {
  return [
    {
      scope: "research_requests_10m",
      windowMs: 10 * 60 * 1000,
      maxUnits: parsePositiveInt(process.env.RESEARCH_REQUESTS_PER_10M, 3),
    },
    {
      scope: "research_items_day",
      windowMs: 24 * 60 * 60 * 1000,
      maxUnits: parsePositiveInt(
        process.env.RESEARCH_ITEMS_PER_DAY,
        Math.max(60, itemUnits * 4)
      ),
    },
  ];
}

export function getCandidateLookupQuotaRules(): QuotaRule[] {
  return [
    {
      scope: "candidate_lookup_requests_10m",
      windowMs: 10 * 60 * 1000,
      maxUnits: parsePositiveInt(
        process.env.CANDIDATE_LOOKUPS_PER_10M,
        12
      ),
    },
    {
      scope: "candidate_lookup_requests_day",
      windowMs: 24 * 60 * 60 * 1000,
      maxUnits: parsePositiveInt(
        process.env.CANDIDATE_LOOKUPS_PER_DAY,
        100
      ),
    },
  ];
}

export function getPrefetchQuotaRules(): QuotaRule[] {
  return [
    {
      scope: "research_prefetch_items_10m",
      windowMs: 10 * 60 * 1000,
      maxUnits: parsePositiveInt(process.env.PREFETCH_ITEMS_PER_10M, 2),
    },
    {
      scope: "research_prefetch_items_day",
      windowMs: 24 * 60 * 60 * 1000,
      maxUnits: parsePositiveInt(process.env.PREFETCH_ITEMS_PER_DAY, 10),
    },
  ];
}

export function getMaxResearchItems(): number {
  return parsePositiveInt(process.env.MAX_RESEARCH_ITEMS_PER_REQUEST, 12);
}

export function getStarterAnalysisLimit(): number {
  return parsePositiveInt(process.env.FREE_STARTER_ANALYSES, 1);
}

export function getStarterAnalysisIpQuotaRules(): QuotaRule[] {
  return [
    {
      scope: "starter_analysis_requests_day",
      windowMs: 24 * 60 * 60 * 1000,
      maxUnits: parsePositiveInt(process.env.STARTER_ANALYSES_PER_IP_DAY, 4),
    },
  ];
}

export function getStarterAnalysisWindowStart(): Date {
  return new Date(STARTER_ANALYSIS_WINDOW_START);
}

export function getBallotParseQuotaRules(): QuotaRule[] {
  return [
    {
      scope: "ballot_parse_requests_10m",
      windowMs: 10 * 60 * 1000,
      maxUnits: parsePositiveInt(process.env.BALLOT_PARSE_REQUESTS_PER_10M, 3),
    },
    {
      scope: "ballot_parse_requests_day",
      windowMs: 24 * 60 * 60 * 1000,
      maxUnits: parsePositiveInt(process.env.BALLOT_PARSE_REQUESTS_PER_DAY, 10),
    },
  ];
}

async function readQuotaUnits(
  supabase: SupabaseClient,
  scope: string,
  windowStart: Date
): Promise<number> {
  const { data, error } = await supabase
    .from("ai_usage_counters")
    .select("units")
    .eq("scope", scope)
    .eq("window_start", windowStart.toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read quota usage for ${scope}: ${error.message}`);
  }

  return Number(data?.units ?? 0);
}

export async function getStarterAnalysisRemaining(
  supabase: SupabaseClient
): Promise<number> {
  const limit = getStarterAnalysisLimit();
  const used = await readQuotaUnits(
    supabase,
    STARTER_ANALYSIS_SCOPE,
    getStarterAnalysisWindowStart()
  );

  return Math.max(0, limit - used);
}

export async function enforceStarterAnalysisQuota(
  supabase: SupabaseClient
): Promise<QuotaResult | null> {
  const maxUnits = getStarterAnalysisLimit();
  const windowStart = getStarterAnalysisWindowStart();
  const { data, error } = await supabase.rpc("enforce_ai_quota", {
    p_scope: STARTER_ANALYSIS_SCOPE,
    p_window_start: windowStart.toISOString(),
    p_max_units: maxUnits,
    p_increment: 1,
  });

  if (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42883"
    ) {
      throw new Error(
        "AI quota functions are not installed. Apply the latest Supabase migrations."
      );
    }

    throw new Error(
      `Failed to enforce quota for ${STARTER_ANALYSIS_SCOPE}: ${error.message}`
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error(
      `Quota function returned no data for ${STARTER_ANALYSIS_SCOPE}`
    );
  }

  const allowed = Boolean(row.allowed);
  const currentUnits = Number(row.current_units ?? 0);

  if (!allowed) {
    return {
      allowed: false,
      scope: STARTER_ANALYSIS_SCOPE,
      currentUnits,
      maxUnits,
      retryAfterSeconds: 0,
    };
  }

  return null;
}

// Refund a reservation made by enforceStarterAnalysisQuota after the paid AI
// work failed, so an unusable response never burns the user's single free
// analysis. Requires the service-role client: migration 017 revoked counter
// writes from authenticated users.
export async function refundStarterAnalysisReservation(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const windowStart = getStarterAnalysisWindowStart().toISOString();
  const { data, error } = await admin
    .from("ai_usage_counters")
    .select("units")
    .eq("user_id", userId)
    .eq("scope", STARTER_ANALYSIS_SCOPE)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (error || !data) return;

  await admin
    .from("ai_usage_counters")
    .update({
      units: Math.max(0, Number(data.units ?? 0) - 1),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("scope", STARTER_ANALYSIS_SCOPE)
    .eq("window_start", windowStart);
}

export async function enforceQuotaRules(
  supabase: SupabaseClient,
  rules: Array<{ rule: QuotaRule; incrementBy: number }>,
  now = new Date()
): Promise<QuotaResult | null> {
  for (const { rule, incrementBy } of rules) {
    const windowStart = getQuotaWindowStart(now, rule.windowMs);
    const { data, error } = await supabase.rpc("enforce_ai_quota", {
      p_scope: rule.scope,
      p_window_start: windowStart.toISOString(),
      p_max_units: rule.maxUnits,
      p_increment: incrementBy,
    });

    if (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "42883"
      ) {
        throw new Error(
          "AI quota functions are not installed. Apply the latest Supabase migrations."
        );
      }

      throw new Error(`Failed to enforce quota for ${rule.scope}: ${error.message}`);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error(`Quota function returned no data for ${rule.scope}`);
    }

    const allowed = Boolean(row.allowed);
    const currentUnits = Number(row.current_units ?? 0);
    const maxUnits = Number(row.limit_units ?? rule.maxUnits);

    if (!allowed) {
      return {
        allowed: false,
        scope: rule.scope,
        currentUnits,
        maxUnits,
        retryAfterSeconds: getRetryAfterSeconds(now, rule.windowMs),
      };
    }
  }

  return null;
}
