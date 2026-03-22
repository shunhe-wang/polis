"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { RaceSection } from "@/components/guide/race-section";
import { CollapsibleContent } from "@/components/guide/collapsible-content";
import { MeasureCard } from "@/components/guide/measure-card";
import type { RaceRecommendation, MeasureResult } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

interface SavedGuide {
  id: string;
  ballot_input: {
    state: string;
    election?: {
      name: string;
      electionDay: string;
      selectedParty: string | null;
    } | null;
  };
  recommendations: RaceRecommendation[];
  measure_results?: MeasureResult[] | null;
  created_at: string;
  is_public: boolean;
}

export default function SharedGuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [guide, setGuide] = useState<SavedGuide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [measuresCollapsed, setMeasuresCollapsed] = useState(false);

  useEffect(() => {
    async function loadGuide() {
      try {
        const res = await fetch(`/api/guide?id=${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(
            data && typeof data === "object" && "error" in data
              ? String(data.error)
              : "Guide not found"
          );
          return;
        }
        const data: SavedGuide = await res.json();
        setGuide(data);
      } catch {
        setError("Failed to load guide");
      } finally {
        setIsLoading(false);
      }
    }
    loadGuide();
  }, [id]);

  if (isLoading) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <p className="text-sm text-muted-foreground">Loading guide...</p>
      </main>
    );
  }

  if (error || !guide) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Guide Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "This guide doesn't exist or is no longer available."}
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
            Create Your Own Guide
          </Link>
        </div>
      </main>
    );
  }

  // Convert recommendations into the format RaceSection expects
  const raceData = guide.recommendations.map((rec) => ({
    raceName: rec.raceName,
    candidates: rec.candidates,
  }));

  const createdDate = new Date(guide.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Shared Voter Guide
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Created {createdDate}
            {guide.ballot_input.state &&
              ` for ${guide.ballot_input.state}`}
          </p>
          {guide.ballot_input.election && (
            <p className="mt-2 text-sm text-muted-foreground">
              {guide.ballot_input.election.name} on{" "}
              {new Date(
                guide.ballot_input.election.electionDay
              ).toLocaleDateString()}
              {guide.ballot_input.election.selectedParty
                ? ` • ${guide.ballot_input.election.selectedParty} ballot`
                : ""}
            </p>
          )}
        </div>

        {/* Race results */}
        <div className="space-y-10">
          {raceData.map(({ raceName, candidates }) => (
            <RaceSection
              key={raceName}
              raceName={raceName}
              candidates={candidates}
            />
          ))}
        </div>

        {/* Ballot measure results */}
        {guide.measure_results && guide.measure_results.length > 0 && (
          <div className="mt-10 rounded-[1.75rem] border border-black/5 bg-white/72 p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h2 className="text-lg font-semibold tracking-tight">
                Ballot Measures
              </h2>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setMeasuresCollapsed((current) => !current)}
              >
                {measuresCollapsed ? "Expand" : "Collapse"}
              </Button>
            </div>
            <CollapsibleContent open={!measuresCollapsed}>
              <div className="space-y-4">
                {guide.measure_results.map((result) => (
                  <MeasureCard key={result.measureId} result={result} />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 border-t pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Want your own personalized voter guide?
          </p>
          <Link
            href="/"
            className={buttonVariants({ className: "mt-3" })}
          >
            Get Your Voter Guide
          </Link>
        </div>
      </div>
    </main>
  );
}
