"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Crown, LogIn, UserPlus, UserRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function StartPage() {
  const router = useRouter();
  const [intentGuide] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("intent") === "guide";
  });

  const goToAuth = useCallback(
    (path: string) => {
      sessionStorage.setItem(
        "authReturnTo",
        intentGuide ? "/guide" : "/onboarding"
      );
      router.push(path);
    },
    [intentGuide, router]
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-200">
            Choose How To Start
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Start with an account, or browse first.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            If you sign in now, your values profile and ballot will be saved as
            you go. If you continue as a guest, you can still build your ballot
            before deciding to create an account.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="flex h-full flex-col pt-6">
              <LogIn className="size-6 text-cyan-700 dark:text-cyan-300" />
              <h2 className="mt-4 text-lg font-semibold">Sign In</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">
                Pick up where you left off, keep your saved ballot, and return
                straight into the setup flow.
              </p>
              <Button
                className="mt-5 rounded-full"
                onClick={() => goToAuth("/auth/login")}
              >
                Sign In
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/15 bg-white/80 shadow-[0_24px_70px_-38px_rgba(8,47,73,0.45)] backdrop-blur-sm dark:border-white/10 dark:bg-white/7">
            <CardContent className="flex h-full flex-col pt-6">
              <UserPlus className="size-6 text-cyan-700 dark:text-cyan-300" />
              <h2 className="mt-4 text-lg font-semibold">Create Free Account</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">
                Save your values profile, keep your ballot synced, and unlock
                your free starter candidate analysis.
              </p>
              <Button
                className="mt-5 rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white"
                onClick={() => goToAuth("/auth/signup")}
              >
                Create Free Account
              </Button>
            </CardContent>
          </Card>

          <Card className="border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="flex h-full flex-col pt-6">
              <UserRound className="size-6 text-cyan-700 dark:text-cyan-300" />
              <h2 className="mt-4 text-lg font-semibold">Continue as Guest</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">
                {intentGuide
                  ? "You can return to your ballot, but guest mode will stop there until you create an account."
                  : "Start the questionnaire and build your ballot first. You can create an account later if you want to save progress and unlock more research."}
              </p>
              <Link
                href={intentGuide ? "/ballot" : "/onboarding"}
                className={buttonVariants({
                  className: "mt-5 rounded-full",
                })}
              >
                {intentGuide ? "Back to Ballot" : "Continue as Guest"}
                <ArrowRight />
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-[1.5rem] border border-black/5 bg-background/70 p-5 text-sm text-muted-foreground dark:border-white/10">
          <div className="flex items-center gap-2">
            <Crown className="size-4 text-cyan-700 dark:text-cyan-300" />
            <p className="font-medium text-foreground">Paid passes unlock the full guide</p>
          </div>
          <p className="mt-2">
            Election passes unlock full-ballot personalized research,
            ballot-measure analysis, and sharing when you need them. Free
            accounts get candidate links plus one starter analysis.
          </p>
          <Link
            href="/pricing"
            className={buttonVariants({
              variant: "outline",
              className: "mt-4 rounded-full",
            })}
          >
            View Plans
          </Link>
        </div>
      </div>
    </main>
  );
}
