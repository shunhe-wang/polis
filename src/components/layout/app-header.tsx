"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  DEFAULT_ACCOUNT_SUMMARY,
  type AccountSummary,
} from "@/lib/freemium";
import { getAccountSummary } from "@/lib/account-client";
import { createClient } from "@/lib/supabase/client";

export function AppHeader() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountSummary>(DEFAULT_ACCOUNT_SUMMARY);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    void getAccountSummary().then(setAccount);
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase?.auth.signOut();
    } finally {
      sessionStorage.removeItem("valuesProfile");
      sessionStorage.removeItem("ballotInput");
      sessionStorage.removeItem("authReturnTo");
      localStorage.removeItem("valuesProfile");
      localStorage.removeItem("ballotInput");
      setAccount(DEFAULT_ACCOUNT_SUMMARY);
      router.push("/");
      router.refresh();
      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-background/70 backdrop-blur-xl dark:border-white/10 dark:bg-background/65">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:flex-nowrap">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(14,116,144,0.95),rgba(15,23,42,0.96))] text-sm font-semibold text-white shadow-lg shadow-cyan-950/20">
            P
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-foreground/90 uppercase">
              Polis
            </p>
            <p className="text-xs text-muted-foreground">
              Voter guide, aligned to your values
            </p>
          </div>
        </Link>
        <nav
          aria-label="Account navigation"
          className="flex w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:justify-end"
        >
          <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
            {account.electionPassCredits > 0 && (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {account.electionPassCredits} pass
                {account.electionPassCredits === 1 ? "" : "es"}
              </Badge>
            )}
          </div>
          {account.isAuthenticated && (
            <>
              <Link
                href="/guides"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                My Guides
              </Link>
              <Link
                href="/onboarding"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Edit Values
              </Link>
              <Link
                href="/account"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Account
              </Link>
            </>
          )}
          <Link
            href="/pricing"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Buy Credits
          </Link>
          {account.isAuthenticated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? "Signing Out..." : "Sign Out"}
            </Button>
          ) : (
            <Link
              href="/auth/login"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sign In
            </Link>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
