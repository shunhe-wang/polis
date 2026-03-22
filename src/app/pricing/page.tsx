"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_ACCOUNT_SUMMARY, type AccountSummary } from "@/lib/freemium";
import { getAccountSummary } from "@/lib/account-client";

export default function PricingPage() {
  const [account, setAccount] = useState<AccountSummary>(
    DEFAULT_ACCOUNT_SUMMARY
  );
  const [isLoading, setIsLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [checkoutState] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("checkout") ?? "";
  });

  useEffect(() => {
    void getAccountSummary().then(setAccount);
  }, []);

  const redirectToBilling = useCallback(async (productKey: string) => {
    setIsLoading(true);
    setBillingError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data || typeof data.url !== "string") {
        setBillingError(
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Billing action failed."
        );
        return;
      }

      window.location.assign(data.url);
    } catch {
      setBillingError("Billing action failed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/75 px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/6">
            <Sparkles className="size-3.5 text-cyan-700 dark:text-cyan-300" />
            Plans
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Choose how deep you want Polis to go.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Free gets you ballot building, candidate links, and one starter
            candidate analysis. Paid passes unlock full-ballot personalized
            research when you actually need it.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Current plan: <span className="font-medium text-foreground">{account.planLabel}</span>
            {account.tier === "free"
              ? ` • ${account.starterAnalysesRemaining} starter analysis remaining`
              : ""}
          </p>
          {account.isAuthenticated && (
            <p className="mt-2 text-sm text-muted-foreground">
              {account.electionPassCredits} election pass credit
              {account.electionPassCredits === 1 ? "" : "s"} •{" "}
              {account.powerPassRunsRemaining} power-pass run
              {account.powerPassRunsRemaining === 1 ? "" : "s"}
              {account.powerPassExpiresAt
                ? ` • Power pass expires ${new Date(account.powerPassExpiresAt).toLocaleDateString()}`
                : ""}
            </p>
          )}
        </div>

        {checkoutState === "success" && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
            Checkout completed. Stripe will add the pass to your account as soon as the webhook lands.
          </div>
        )}

        {checkoutState === "cancelled" && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Checkout was canceled. Your account is still on its current plan.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <PlanCard
            title="Guest"
            price="$0"
            subtitle="Ballot access only"
            features={[
              "Complete onboarding",
              "Build or import your ballot",
              "No candidate links or AI analysis",
            ]}
            action={
              <Link href="/onboarding">
                <Button variant="outline" className="w-full rounded-full">
                  Continue as Guest
                </Button>
              </Link>
            }
          />

          <PlanCard
            title="Free"
            price="$0"
            subtitle="Try Polis properly"
            highlighted={account.planKey === "free"}
            features={[
              "Everything in Guest",
              "Candidate source links",
              "1 starter candidate analysis",
            ]}
            action={
              account.isAuthenticated ? (
                <Button disabled className="w-full rounded-full">
                  {account.planKey === "free" ? "Current Plan" : "Signed In"}
                </Button>
              ) : (
                <Link href="/auth/signup">
                  <Button className="w-full rounded-full">
                    Create Free Account
                  </Button>
                </Link>
              )
            }
          />

          <PlanCard
            title="Election Pass"
            price="$9.99"
            subtitle="One ballot, one time"
            highlighted={account.planKey === "election_pass"}
            features={[
              "Full-ballot personalized research",
              "Ballot measure analysis",
              "Save and share guides",
              "Unlocks one ballot",
            ]}
            action={
              account.isAuthenticated ? (
                <Button
                  className="w-full rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white"
                  disabled={!account.checkoutConfigured || isLoading}
                  onClick={() => void redirectToBilling("election_pass")}
                >
                  {account.checkoutConfigured ? "Buy Election Pass" : "Billing Not Configured"}
                </Button>
              ) : (
                <Link href="/auth/signup">
                  <Button className="w-full rounded-full">
                    Sign Up to Buy
                  </Button>
                </Link>
              )
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PlanCard
            title="3-Pack"
            price="$24.99"
            subtitle="Three ballots"
            highlighted={account.planKey === "bundle_3"}
            features={[
              "Three full-ballot unlocks",
              "Use them across different elections",
              "Cheaper than buying one at a time",
            ]}
            action={
              account.isAuthenticated ? (
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  disabled={!account.checkoutConfigured || isLoading}
                  onClick={() => void redirectToBilling("bundle_3")}
                >
                  Buy 3-Pack
                </Button>
              ) : (
                <Link href="/auth/signup">
                  <Button variant="outline" className="w-full rounded-full">
                    Sign Up to Buy
                  </Button>
                </Link>
              )
            }
          />

          <PlanCard
            title="Power Pass"
            price="$29.99"
            subtitle="Ten unlocks over 14 days"
            highlighted={account.planKey === "power_14d"}
            features={[
              "Ten ballot unlocks",
              "Best for nerds and multi-ballot comparisons",
              "Expires 14 days after activation",
            ]}
            action={
              account.isAuthenticated ? (
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  disabled={!account.checkoutConfigured || isLoading}
                  onClick={() => void redirectToBilling("power_14d")}
                >
                  Buy Power Pass
                </Button>
              ) : (
                <Link href="/auth/signup">
                  <Button variant="outline" className="w-full rounded-full">
                    Sign Up to Buy
                  </Button>
                </Link>
              )
            }
          />
        </div>

        {billingError && (
          <p className="text-center text-sm text-destructive">
            {billingError}
          </p>
        )}
      </div>
    </main>
  );
}

function PlanCard({
  title,
  price,
  subtitle,
  features,
  action,
  highlighted = false,
}: {
  title: string;
  price: string;
  subtitle: string;
  features: string[];
  action: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <Card
      className={
        highlighted
          ? "border-primary/15 bg-white/82 shadow-[0_24px_70px_-38px_rgba(8,47,73,0.45)] backdrop-blur-sm dark:border-white/10 dark:bg-white/7"
          : "border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
      }
    >
      <CardContent className="flex h-full flex-col pt-6">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-3 text-3xl font-semibold">{price}</p>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <ul className="mt-5 flex-1 space-y-3 text-sm text-muted-foreground">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 text-cyan-700 dark:text-cyan-300" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">{action}</div>
      </CardContent>
    </Card>
  );
}
