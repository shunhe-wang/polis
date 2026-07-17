import type { SupabaseClient } from "@supabase/supabase-js";
import { ELECTION_PASS_PRICE_CENTS, getProductPriceId } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";

export interface AdminEventRow {
  category: string;
  event: string;
  severity: string;
  route: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

export interface AdminOrderRow {
  amount_total: number | null;
  currency: string | null;
  status: string;
}

export interface AdminAppStoreTransactionRow {
  credits_granted: number;
  fulfilled_at: string | null;
}

interface AdminOperationsInput {
  totalUsers: number;
  activeGuides: number;
  configuredProUsers: number;
  unfulfilledOrders: number;
  events: AdminEventRow[];
  orders: AdminOrderRow[];
  appStoreTransactions: AdminAppStoreTransactionRow[];
  openContentReports: number;
  oldestOpenContentReportAt: string | null;
  providerPricing: ProviderPricing | null;
  latestElectionDataProbe: AdminEventRow | null;
  now?: Date;
}

interface ProviderPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  webSearchUsdPerUse: number;
}

export interface AdminRecentError {
  event: string;
  route: string | null;
  createdAt: string;
  message: string;
}

export type ElectionDataStatus =
  | "healthy"
  | "degraded"
  | "stale"
  | "unconfigured";

export interface AdminDashboardData {
  totalUsers: number;
  activeGuides: number;
  configuredProUsers: number;
  researchEvents24h: number;
  providerCalls24h: number;
  providerErrors24h: number;
  averageProviderLatencyMs: number | null;
  providerTokens24h: number;
  estimatedProviderCostUsd24h: number | null;
  paidOrders24h: number;
  grossRevenueCents24h: number;
  unfulfilledOrders: number;
  appStorePurchases24h: number;
  appStoreCreditsGranted24h: number;
  appStoreFulfillmentFailures24h: number;
  purchaseRevocations24h: number;
  openContentReports: number;
  oldestOpenContentReportAt: string | null;
  recordedQuotaDenials24h: number;
  electionDataStatus: ElectionDataStatus;
  latestElectionDataProbeAt: string | null;
  electionDataHasBallot: boolean | null;
  electionDataProbeLatencyMs: number | null;
  recentErrors: AdminRecentError[];
  warnings: string[];
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function summarizeAdminOperations(
  input: AdminOperationsInput
): Omit<AdminDashboardData, "warnings"> {
  const now = input.now ?? new Date();
  const latestProbe = input.latestElectionDataProbe;
  const latestProbeTime = latestProbe
    ? new Date(latestProbe.created_at).getTime()
    : Number.NaN;
  const probeIsStale =
    Number.isFinite(latestProbeTime) &&
    now.getTime() - latestProbeTime > 30 * 60 * 60 * 1000;
  const electionDataStatus = !latestProbe
    ? "unconfigured"
    : probeIsStale
      ? "stale"
      : latestProbe.event === "election_data_probe_succeeded"
        ? "healthy"
        : "degraded";
  const providerEvents = input.events.filter(
    (event) => event.category === "provider" && event.event.startsWith("zai_")
  );
  const providerLatencies = providerEvents.flatMap((event) => {
    const duration = readFiniteNumber(event.details?.durationMs);
    return duration === null ? [] : [duration];
  });
  const providerTokens24h = providerEvents.reduce((total, event) => {
    return total + (readFiniteNumber(event.details?.totalTokens) ?? 0);
  }, 0);
  const providerPricing = input.providerPricing;
  const estimatedProviderCostUsd24h = providerPricing
    ? providerEvents.reduce((total, event) => {
        const promptTokens = readFiniteNumber(event.details?.promptTokens) ?? 0;
        const completionTokens =
          readFiniteNumber(event.details?.completionTokens) ?? 0;
        const webSearchUses =
          readFiniteNumber(event.details?.webSearchUses) ?? 0;
        return (
          total +
          (promptTokens / 1_000_000) *
            providerPricing.inputUsdPerMillion +
          (completionTokens / 1_000_000) *
            providerPricing.outputUsdPerMillion +
          webSearchUses * providerPricing.webSearchUsdPerUse
        );
      }, 0)
    : null;
  const paidOrders = input.orders.filter(
    (order) => order.status === "paid" && order.currency === "usd"
  );

  return {
    totalUsers: input.totalUsers,
    activeGuides: input.activeGuides,
    configuredProUsers: input.configuredProUsers,
    researchEvents24h: input.events.filter(
      (event) => event.category === "research"
    ).length,
    providerCalls24h: providerEvents.length,
    providerErrors24h: providerEvents.filter(
      (event) => event.severity === "error"
    ).length,
    averageProviderLatencyMs:
      providerLatencies.length > 0
        ? Math.round(
            providerLatencies.reduce((total, value) => total + value, 0) /
              providerLatencies.length
          )
        : null,
    providerTokens24h,
    estimatedProviderCostUsd24h:
      estimatedProviderCostUsd24h === null
        ? null
        : Number(estimatedProviderCostUsd24h.toFixed(6)),
    paidOrders24h: paidOrders.length,
    grossRevenueCents24h: paidOrders.reduce(
      (total, order) => total + Number(order.amount_total ?? 0),
      0
    ),
    unfulfilledOrders: input.unfulfilledOrders,
    appStorePurchases24h: input.appStoreTransactions.length,
    appStoreCreditsGranted24h: input.appStoreTransactions.reduce(
      (total, transaction) =>
        total + Number(transaction.credits_granted ?? 0),
      0
    ),
    // A fulfilled_at IS NULL query can never fire (the fulfillment RPC sets it
    // in the same database transaction as the insert), so failed fulfillments
    // are counted from recorded failure events instead.
    appStoreFulfillmentFailures24h: input.events.filter(
      (event) => event.event === "app_store_transaction_failed"
    ).length,
    purchaseRevocations24h: input.events.filter(
      (event) =>
        event.event === "app_store_transaction_revoked" ||
        event.event === "billing_order_refunded"
    ).length,
    openContentReports: input.openContentReports,
    oldestOpenContentReportAt: input.oldestOpenContentReportAt,
    recordedQuotaDenials24h: input.events.filter(
      (event) =>
        event.event.endsWith("_quota_reached") ||
        event.event.includes("quota_denied")
    ).length,
    electionDataStatus,
    latestElectionDataProbeAt: latestProbe?.created_at ?? null,
    electionDataHasBallot:
      typeof latestProbe?.details?.hasBallot === "boolean"
        ? latestProbe.details.hasBallot
        : null,
    electionDataProbeLatencyMs:
      readFiniteNumber(latestProbe?.details?.durationMs) ?? null,
    recentErrors: input.events
      .filter((event) => event.severity === "error")
      .slice(0, 10)
      .map((event) => ({
        event: event.event,
        route: event.route,
        createdAt: event.created_at,
        message:
          typeof event.details?.message === "string"
            ? event.details.message
            : event.event.replaceAll("_", " "),
      })),
  };
}

function getConfiguredProEmails(): Set<string> {
  return new Set(
    (process.env.PRO_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getProviderPricing(): ProviderPricing | null {
  const values = [
    process.env.ZAI_INPUT_USD_PER_MILLION,
    process.env.ZAI_OUTPUT_USD_PER_MILLION,
    process.env.ZAI_WEB_SEARCH_USD_PER_USE,
  ].map((value) => (value ? Number.parseFloat(value) : Number.NaN));

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }

  return {
    inputUsdPerMillion: values[0],
    outputUsdPerMillion: values[1],
    webSearchUsdPerUse: values[2],
  };
}

const USERS_PAGE_SIZE = 1000;
const USERS_MAX_PAGES = 20;

async function listAllUsers(admin: SupabaseClient): Promise<{
  users: Array<{ email?: string | null }>;
  total: number;
  truncated: boolean;
  error: unknown;
}> {
  const users: Array<{ email?: string | null }> = [];
  let total = 0;
  for (let page = 1; page <= USERS_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: USERS_PAGE_SIZE,
    });
    if (error) return { users, total, truncated: false, error };
    const batch = data?.users ?? [];
    users.push(...batch);
    total = Number(
      (data as { total?: number } | null)?.total ?? users.length
    );
    if (batch.length < USERS_PAGE_SIZE) {
      return { users, total, truncated: false, error: null };
    }
  }
  return {
    users,
    total: Math.max(total, users.length),
    truncated: true,
    error: null,
  };
}

export async function loadAdminDashboardData(
  admin: SupabaseClient
): Promise<AdminDashboardData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    usersResult,
    guidesResult,
    eventsResult,
    ordersResult,
    unfulfilledResult,
    appStoreTransactionsResult,
    openReportsResult,
    oldestOpenReportResult,
    latestProbeResult,
  ] = await Promise.all([
    listAllUsers(admin),
    admin.from("voter_guides").select("id", { count: "exact", head: true }),
    admin
      .from("app_event_logs")
      .select("category, event, severity, route, created_at, details")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(250),
    admin
      .from("billing_orders")
      .select("amount_total, currency, status")
      .gte("purchased_at", since),
    admin
      .from("billing_orders")
      .select("id", { count: "exact", head: true })
      .is("fulfilled_at", null),
    admin
      .from("app_store_transactions")
      .select("credits_granted, fulfilled_at")
      .gte("purchase_date", since),
    admin
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_review"]),
    admin
      .from("content_reports")
      .select("created_at")
      .in("status", ["open", "in_review"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("app_event_logs")
      .select("category, event, severity, route, created_at, details")
      .eq("category", "election_data")
      .in("event", [
        "election_data_probe_succeeded",
        "election_data_probe_degraded",
        "election_data_probe_failed",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const warnings: string[] = [];
  const providerPricing = getProviderPricing();
  if (usersResult.error) warnings.push("User totals are unavailable.");
  if (guidesResult.error) warnings.push("Saved-guide totals are unavailable.");
  if (eventsResult.error) warnings.push("Operational events are unavailable.");
  if ((eventsResult.data?.length ?? 0) === 250) {
    warnings.push(
      "Event metrics are capped at the latest 250 records in the 24-hour window."
    );
  }
  if (ordersResult.error) warnings.push("Recent billing totals are unavailable.");
  if (unfulfilledResult.error) {
    warnings.push("Billing reconciliation status is unavailable.");
  }
  if (appStoreTransactionsResult.error) {
    warnings.push("Recent App Store purchase totals are unavailable.");
  }
  if (openReportsResult.error || oldestOpenReportResult.error) {
    warnings.push("Content-report status is unavailable.");
  }
  if (latestProbeResult.error) {
    warnings.push("Election-data freshness is unavailable.");
  }
  if (!providerPricing) {
    warnings.push(
      "Provider cost estimates require the current Z.AI token and web-search rates."
    );
  }

  if (usersResult.truncated) {
    warnings.push(
      `User metrics are capped at the first ${USERS_PAGE_SIZE * USERS_MAX_PAGES} accounts.`
    );
  }

  // The pricing page displays ELECTION_PASS_PRICE_CENTS while Stripe charges
  // whatever the configured price object says; surface any drift before it
  // becomes a mislabeled charge.
  const stripe = getStripeClient();
  const electionPassPriceId = getProductPriceId("election_pass");
  if (stripe && electionPassPriceId) {
    try {
      const price = await stripe.prices.retrieve(electionPassPriceId);
      if (
        typeof price.unit_amount === "number" &&
        (price.unit_amount !== ELECTION_PASS_PRICE_CENTS ||
          price.currency !== "usd")
      ) {
        warnings.push(
          `The configured Stripe Election Pass price (${price.unit_amount} ${price.currency}) does not match the displayed price (${ELECTION_PASS_PRICE_CENTS} usd).`
        );
      }
    } catch {
      warnings.push("The Stripe Election Pass price could not be verified.");
    }
  }

  const users = usersResult.users;
  const proEmails = getConfiguredProEmails();
  const summary = summarizeAdminOperations({
    totalUsers: usersResult.error ? 0 : usersResult.total,
    activeGuides: guidesResult.error ? 0 : Number(guidesResult.count ?? 0),
    configuredProUsers: users.filter((user) =>
      proEmails.has(user.email?.toLowerCase() ?? "")
    ).length,
    unfulfilledOrders: unfulfilledResult.error
      ? 0
      : Number(unfulfilledResult.count ?? 0),
    appStoreTransactions: (appStoreTransactionsResult.data ?? []) as
      AdminAppStoreTransactionRow[],
    openContentReports: openReportsResult.error
      ? 0
      : Number(openReportsResult.count ?? 0),
    oldestOpenContentReportAt: oldestOpenReportResult.error
      ? null
      : ((oldestOpenReportResult.data as { created_at: string } | null)
          ?.created_at ?? null),
    events: (eventsResult.data ?? []) as AdminEventRow[],
    orders: (ordersResult.data ?? []) as AdminOrderRow[],
    providerPricing,
    latestElectionDataProbe: latestProbeResult.error
      ? null
      : (latestProbeResult.data as AdminEventRow | null),
  });

  return { ...summary, warnings };
}
