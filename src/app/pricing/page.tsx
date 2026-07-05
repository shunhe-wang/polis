"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_ACCOUNT_SUMMARY, type AccountSummary } from "@/lib/freemium";
import { getAccountSummary } from "@/lib/account-client";

export default function PricingPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountSummary>(
    DEFAULT_ACCOUNT_SUMMARY
  );
  const [isLoading, setIsLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState("");

  useEffect(() => {
    void getAccountSummary().then(setAccount);
    setCheckoutState(new URLSearchParams(window.location.search).get("checkout") ?? "");
  }, []);

  const sendToAuth = useCallback(
    (path: string) => {
      sessionStorage.setItem("authReturnTo", "/pricing");
      router.push(path);
    },
    [router]
  );

  const redirectToBilling = useCallback(async () => {
    setIsLoading(true);
    setBillingError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey: "election_pass" }),
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

  const hasCredits = account.electionPassCredits > 0;

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/75 px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/6">
            <Sparkles className="size-3.5 text-cyan-700 dark:text-cyan-300" />
            Election Pass Credits
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Get a full ballot guide for $1.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Guest mode lets you browse ballots. Signed-in accounts can buy and
            hold $1 Election Pass credits, then spend 1 credit to unlock a full
            ballot guide when they are ready.
          </p>
          {account.isAuthenticated && (
            <p className="mt-4 text-sm text-muted-foreground">
              Account balance:{" "}
              <span className="font-medium text-foreground">
                {account.electionPassCredits} Election Pass credit
                {account.electionPassCredits === 1 ? "" : "s"}
              </span>
            </p>
          )}
          {account.isAuthenticated && !account.trustedAccount && account.trustReason && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {account.trustReason}
            </p>
          )}
        </div>

        {checkoutState === "success" && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
            Checkout completed. Your credit will appear as soon as Stripe finishes the webhook.
          </div>
        )}

        {checkoutState === "cancelled" && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Checkout was canceled. No credits were added to your account.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
          <Card className="border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold">How credits work</h2>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>1 credit is added to your account when you buy an Election Pass.</p>
                <p>1 credit is consumed only when you unlock a ballot.</p>
                <p>Credits stay on your account until you use them.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/15 bg-white/80 shadow-[0_24px_70px_-38px_rgba(8,47,73,0.45)] backdrop-blur-sm dark:border-white/10 dark:bg-white/7">
            <CardContent className="pt-6">
              {!account.isAuthenticated ? (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold">Start as a guest or sign in</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      You can browse ballots without an account. Sign in or create
                      an account when you want to save progress and buy credits.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/start" className="flex-1">
                      <Button variant="outline" className="w-full rounded-full">
                        Continue as Guest
                      </Button>
                    </Link>
                    <Button
                      className="rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white"
                      onClick={() => sendToAuth("/auth/login")}
                    >
                      Sign In
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => sendToAuth("/auth/signup")}
                    >
                      Create Account
                    </Button>
                  </div>
                </div>
              ) : hasCredits ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-cyan-500/10 p-3 text-cyan-800 dark:text-cyan-200">
                      <Ticket className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Credits ready to use</h2>
                      <p className="text-sm text-muted-foreground">
                        This account has {account.electionPassCredits} Election Pass credit
                        {account.electionPassCredits === 1 ? "" : "s"} available.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/guide" className="flex-1">
                      <Button className="w-full rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white">
                        Continue to Guide
                        <ArrowRight />
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => void redirectToBilling()}
                      disabled={!account.checkoutConfigured || isLoading || !account.trustedAccount}
                    >
                      {account.trustedAccount ? "Buy Another Credit" : "Verify Email to Buy"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold">Buy a $1 Election Pass</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Each $1 purchase adds one credit for one full ballot guide.
                      You can come back later and buy more as needed.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-black/5 bg-background/70 p-4 dark:border-white/10">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-foreground">Election Pass</p>
                        <p className="text-sm text-muted-foreground">
                          Adds 1 full-ballot guide credit to your account
                        </p>
                      </div>
                      <p className="text-lg font-semibold">$1.00</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white"
                      disabled={!account.checkoutConfigured || isLoading || !account.trustedAccount}
                      onClick={() => void redirectToBilling()}
                    >
                      {!account.trustedAccount
                        ? "Verify Email to Buy"
                        : account.checkoutConfigured
                          ? "Buy Election Pass"
                          : "Billing Not Configured"}
                    </Button>
                    <Link href="/guide">
                      <Button variant="outline" className="rounded-full">
                        Continue Browsing
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {billingError && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-900 dark:text-red-100">
            {billingError}
          </div>
        )}
      </div>
    </main>
  );
}
