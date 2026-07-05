import type { SupabaseClient } from "@supabase/supabase-js";

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

interface AdminOperationsInput {
  totalUsers: number;
  activeGuides: number;
  configuredProUsers: number;
  unfulfilledOrders: number;
  events: AdminEventRow[];
  orders: AdminOrderRow[];
  providerPricing: ProviderPricing | null;
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
  recordedQuotaDenials24h: number;
  recentErrors: AdminRecentError[];
  warnings: string[];
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function summarizeAdminOperations(
  input: AdminOperationsInput
): Omit<AdminDashboardData, "warnings"> {
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
    recordedQuotaDenials24h: input.events.filter(
      (event) =>
        event.event.endsWith("_quota_reached") ||
        event.event.includes("quota_denied")
    ).length,
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

export async function loadAdminDashboardData(
  admin: SupabaseClient
): Promise<AdminDashboardData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [usersResult, guidesResult, eventsResult, ordersResult, unfulfilledResult] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("saved_guides").select("id", { count: "exact", head: true }),
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
  if (!providerPricing) {
    warnings.push(
      "Provider cost estimates require the current Z.AI token and web-search rates."
    );
  }

  const users = usersResult.data?.users ?? [];
  const proEmails = getConfiguredProEmails();
  const summary = summarizeAdminOperations({
    totalUsers: usersResult.error
      ? 0
      : Number(usersResult.data?.total ?? users.length),
    activeGuides: guidesResult.error ? 0 : Number(guidesResult.count ?? 0),
    configuredProUsers: users.filter((user) =>
      proEmails.has(user.email?.toLowerCase() ?? "")
    ).length,
    unfulfilledOrders: unfulfilledResult.error
      ? 0
      : Number(unfulfilledResult.count ?? 0),
    events: (eventsResult.data ?? []) as AdminEventRow[],
    orders: (ordersResult.data ?? []) as AdminOrderRow[],
    providerPricing,
  });

  return { ...summary, warnings };
}
