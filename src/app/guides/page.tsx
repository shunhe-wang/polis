"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DEFAULT_ACCOUNT_SUMMARY,
  type AccountSummary,
} from "@/lib/freemium";
import { getAccountSummary } from "@/lib/account-client";

interface SavedGuideListItem {
  id: string;
  created_at: string;
  is_public: boolean;
  ballot_input: {
    state?: string;
    election?: {
      name?: string;
      electionDay?: string;
      selectedParty?: string | null;
    } | null;
  };
}

export default function GuidesPage() {
  const [account, setAccount] = useState<AccountSummary>(
    DEFAULT_ACCOUNT_SUMMARY
  );
  const [guides, setGuides] = useState<SavedGuideListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const summary = await getAccountSummary();
      setAccount(summary);

      if (!summary.isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/guide", { cache: "no-store" });
        const data = await response.json().catch(() => null);

        if (!response.ok || !Array.isArray(data)) {
          setError(
            data && typeof data === "object" && "error" in data
              ? String(data.error)
              : "Could not load your saved guides."
          );
          return;
        }

        setGuides(data as SavedGuideListItem[]);
      } catch {
        setError("Could not load your saved guides.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              My Guides
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Every saved guide stays accessible here. If you unlocked multiple
              ballots over time, you can come back to all of them from this page.
            </p>
          </div>
          {account.isAuthenticated && (
            <div className="flex flex-wrap gap-2">
              <Link href="/onboarding">
                <Button variant="outline" className="rounded-full">
                  Edit Values
                </Button>
              </Link>
              <Link href="/ballot">
                <Button className="rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white">
                  Build Ballot
                </Button>
              </Link>
            </div>
          )}
        </div>

        {!account.isAuthenticated ? (
          <Card className="border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="pt-6 text-center">
              <h2 className="text-lg font-semibold">Sign in to see your saved guides</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Saved guides are tied to your account, so you’ll need to sign in
                before you can access them here.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <Link href="/auth/login">
                  <Button className="rounded-full">Sign In</Button>
                </Link>
                <Link href="/auth/signup">
                  <Button variant="outline" className="rounded-full">
                    Create Account
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your saved guides...</p>
        ) : error ? (
          <Card className="border-red-500/20 bg-red-500/10">
            <CardContent className="pt-6">
              <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
            </CardContent>
          </Card>
        ) : guides.length === 0 ? (
          <Card className="border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold">No saved guides yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Build a ballot, unlock it with a credit, then save the guide and
                it will show up here.
              </p>
              <Link
                href="/ballot"
                className={buttonVariants({
                  className:
                    "mt-5 rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white hover:opacity-95 dark:text-white",
                })}
              >
                Start a Ballot
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {guides.map((guide) => {
              const election = guide.ballot_input?.election;
              const subtitle = election?.name
                ? `${election.name}${guide.ballot_input?.state ? ` • ${guide.ballot_input.state}` : ""}`
                : guide.ballot_input?.state
                  ? `State: ${guide.ballot_input.state}`
                  : "Saved guide";

              return (
                <Card
                  key={guide.id}
                  className="border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{subtitle}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Saved{" "}
                        {new Date(guide.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                        {election?.electionDay
                          ? ` • Election day ${new Date(
                              election.electionDay
                            ).toLocaleDateString()}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {guide.is_public ? "Shareable guide" : "Private guide"}
                      </p>
                    </div>
                    <Link href={`/guide/${guide.id}`}>
                      <Button className="rounded-full">Open Guide</Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
