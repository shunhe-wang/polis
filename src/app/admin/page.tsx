import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import {
  loadAdminDashboardData,
  type ElectionDataStatus,
} from "@/lib/admin-dashboard";

export default async function AdminPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Admin Unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Supabase authentication is not configured.
          </p>
        </div>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (!isAdminEmail(user.email)) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is restricted to configured admin accounts.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set `ADMIN_EMAILS` to a comma-separated allowlist to grant access.
          </p>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", className: "mt-6" })}
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Admin Data Unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The Supabase service role is not configured.
          </p>
        </div>
      </main>
    );
  }

  const dashboard = await loadAdminDashboardData(admin);
  const reconciliationIssues =
    dashboard.unfulfilledOrders + dashboard.appStoreFulfillmentFailures24h;

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Admin Dashboard
            </h1>
            <Badge variant="secondary">Restricted</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {user.email}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Operational totals below use the latest 24-hour window unless noted.
          </p>
        </div>

        {dashboard.warnings.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">Some metrics could not be loaded.</p>
            <ul className="mt-2 list-disc pl-5">
              {dashboard.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Users" value={dashboard.totalUsers} />
          <StatCard label="Saved Guides" value={dashboard.activeGuides} />
          <StatCard
            label="Research Events (24h)"
            value={dashboard.researchEvents24h}
          />
          <StatCard
            label="Configured Pro Users"
            value={dashboard.configuredProUsers}
          />
        </div>

        <Separator className="my-8" />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Z.AI Provider Health</h2>
            <Badge
              variant={dashboard.providerErrors24h > 0 ? "destructive" : "secondary"}
            >
              {dashboard.providerErrors24h > 0 ? "Needs attention" : "No recorded errors"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Provider Calls" value={dashboard.providerCalls24h} />
            <StatCard label="Provider Errors" value={dashboard.providerErrors24h} />
            <StatCard
              label="Average Latency"
              value={formatDuration(dashboard.averageProviderLatencyMs)}
            />
            <StatCard
              label="Tokens Reported"
              value={dashboard.providerTokens24h.toLocaleString()}
            />
            <StatCard
              label="Estimated Cost"
              value={formatProviderCost(
                dashboard.estimatedProviderCostUsd24h
              )}
            />
          </div>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Election Data Freshness</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Daily authenticated probe of the Google Civic ballot path.
              </p>
            </div>
            <Badge variant={electionDataBadgeVariant(dashboard.electionDataStatus)}>
              {formatElectionDataStatus(dashboard.electionDataStatus)}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              label="Last Probe"
              value={
                dashboard.latestElectionDataProbeAt
                  ? formatTimestamp(dashboard.latestElectionDataProbeAt)
                  : "No data"
              }
            />
            <StatCard
              label="Probe Latency"
              value={formatDuration(dashboard.electionDataProbeLatencyMs)}
            />
            <StatCard
              label="Ballot Returned"
              value={
                dashboard.electionDataHasBallot === null
                  ? "No data"
                  : dashboard.electionDataHasBallot
                    ? "Yes"
                    : "No"
              }
            />
          </div>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Billing and Quotas</h2>
            <Badge
              variant={reconciliationIssues > 0 ? "destructive" : "secondary"}
            >
              {reconciliationIssues > 0
                ? `${reconciliationIssues} reconciliation issue${reconciliationIssues === 1 ? "" : "s"}`
                : "Billing reconciled"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Stripe Paid Orders"
              value={dashboard.paidOrders24h}
            />
            <StatCard
              label="Gross Web Revenue"
              value={formatUsd(dashboard.grossRevenueCents24h)}
            />
            <StatCard
              label="Unfulfilled Stripe"
              value={dashboard.unfulfilledOrders}
            />
            <StatCard
              label="StoreKit Purchases"
              value={dashboard.appStorePurchases24h}
            />
            <StatCard
              label="StoreKit Credits"
              value={dashboard.appStoreCreditsGranted24h}
            />
            <StatCard
              label="StoreKit Failures (24h)"
              value={dashboard.appStoreFulfillmentFailures24h}
            />
            <StatCard
              label="Refunds/Revocations (24h)"
              value={dashboard.purchaseRevocations24h}
            />
            <StatCard
              label="Recorded Quota Denials"
              value={dashboard.recordedQuotaDenials24h}
            />
          </div>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Content Reports</h2>
            <Badge
              variant={
                dashboard.openContentReports > 0 ? "destructive" : "secondary"
              }
            >
              {dashboard.openContentReports > 0
                ? `${dashboard.openContentReports} open report${dashboard.openContentReports === 1 ? "" : "s"}`
                : "No open reports"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard
              label="Open Reports"
              value={dashboard.openContentReports}
            />
            <StatCard
              label="Oldest Open Report"
              value={
                dashboard.oldestOpenContentReportAt
                  ? formatTimestamp(dashboard.oldestOpenContentReportAt)
                  : "None"
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            User-submitted corrections for election content. Triage per the
            data-correction runbook in docs/runbooks/data-correction.md.
          </p>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Errors</h2>
          {dashboard.recentErrors.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No application or provider errors were recorded in the last 24 hours.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {dashboard.recentErrors.map((error) => (
                <Card key={`${error.event}-${error.createdAt}`} size="sm">
                  <CardContent className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{error.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {error.event.replaceAll("_", " ")}
                        {error.route ? ` • ${error.route}` : ""}
                      </p>
                    </div>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={error.createdAt}
                    >
                      {formatTimestamp(error.createdAt)}
                    </time>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-4 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "No data";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function formatProviderCost(value: number | null): string {
  if (value === null) return "Set rates";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function formatElectionDataStatus(
  status: ElectionDataStatus
): string {
  if (status === "healthy") return "Healthy";
  if (status === "degraded") return "Degraded";
  if (status === "stale") return "Stale";
  return "Not configured";
}

function electionDataBadgeVariant(
  status: ElectionDataStatus
): "secondary" | "destructive" | "outline" {
  if (status === "healthy") return "secondary";
  if (status === "unconfigured") return "outline";
  return "destructive";
}
