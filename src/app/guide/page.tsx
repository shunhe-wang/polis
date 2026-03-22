"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ResearchProgress } from "@/components/guide/research-progress";
import { RaceSection } from "@/components/guide/race-section";
import { MeasureCard } from "@/components/guide/measure-card";
import { ProGate } from "@/components/layout/pro-gate";
import { useStreamingResearch } from "@/hooks/useStreamingResearch";
import { getUserTier, canAccessFeature, type UserTier } from "@/lib/freemium";
import { syncFromSupabase } from "@/lib/persistence";
import type {
  ValuesProfile,
  BallotInput,
  CandidateResult,
  RaceRecommendation,
} from "@/lib/types";

export default function GuidePage() {
  const router = useRouter();
  const [valuesProfile, setValuesProfile] = useState<ValuesProfile | null>(
    null
  );
  const [ballotInput, setBallotInput] = useState<BallotInput | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<UserTier>("free");
  const [tierLoaded, setTierLoaded] = useState(false);
  const skipCacheRef = useRef(false);

  const {
    statuses,
    measureStatuses,
    results,
    measureResults,
    isResearching,
    error,
    startResearch,
  } = useStreamingResearch();

  // Load data from sessionStorage (with Supabase fallback) and check tier
  useEffect(() => {
    async function load() {
      // Try to sync from Supabase if sessionStorage is empty
      await syncFromSupabase();

      const profileStr = sessionStorage.getItem("valuesProfile");
      const ballotStr = sessionStorage.getItem("ballotInput");

      if (!profileStr || !ballotStr) {
        router.push("/onboarding");
        return;
      }

      setValuesProfile(JSON.parse(profileStr) as ValuesProfile);
      setBallotInput(JSON.parse(ballotStr) as BallotInput);

      const tier = await getUserTier();
      setUserTier(tier);
      setTierLoaded(true);
    }
    load();
  }, [router]);

  // Auto-start research when data is loaded and user has access
  useEffect(() => {
    if (
      valuesProfile &&
      ballotInput &&
      !hasStarted &&
      tierLoaded &&
      canAccessFeature(userTier, "research")
    ) {
      setHasStarted(true);
      startResearch(valuesProfile, ballotInput, {
        skipCache: skipCacheRef.current,
      });
      skipCacheRef.current = false;
    }
  }, [valuesProfile, ballotInput, hasStarted, startResearch, userTier, tierLoaded]);

  // Group results by race
  const resultsByRace = useMemo(() => {
    const grouped = new Map<string, CandidateResult[]>();
    for (const result of results) {
      const existing = grouped.get(result.race) ?? [];
      existing.push(result);
      grouped.set(result.race, existing);
    }
    return grouped;
  }, [results]);

  const handleSaveAndShare = useCallback(async () => {
    if (
      !valuesProfile ||
      !ballotInput ||
      (results.length === 0 && measureResults.length === 0)
    )
      return;

    setIsSaving(true);
    setSaveError(null);

    // Build recommendations from results grouped by race
    const recommendations: RaceRecommendation[] = [];
    const grouped = new Map<string, CandidateResult[]>();
    for (const r of results) {
      const existing = grouped.get(r.race) ?? [];
      existing.push(r);
      grouped.set(r.race, existing);
    }

    for (const [raceName, candidates] of grouped) {
      const sorted = [...candidates].sort(
        (a, b) => b.alignmentScore - a.alignmentScore
      );
      const recommended = sorted[0];
      recommendations.push({
        raceId: candidates[0].candidateId,
        raceName,
        candidates: sorted,
        recommendedCandidateId:
          recommended.confidence !== "low" ? recommended.candidateId : null,
        confidence: recommended.confidence,
        explanation: recommended.reasoning,
      });
    }

    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valuesProfile,
          ballotInput,
          recommendations,
          measureResults:
            measureResults.length > 0 ? measureResults : undefined,
          isPublic: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Failed to save guide";
        setSaveError(msg);
        return;
      }

      const { id } = await res.json();
      const url = `${window.location.origin}/guide/${id}`;
      setShareUrl(url);

      // Copy to clipboard
      await navigator.clipboard.writeText(url).catch(() => {
        // Clipboard API may not be available
      });
    } catch {
      setSaveError("Failed to save guide. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [valuesProfile, ballotInput, results, measureResults]);

  if (!valuesProfile || !ballotInput) {
    return null;
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Your Voter Guide
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isResearching
              ? "Sit tight — we're doing deep research on each item to give you comprehensive, cited results. This may take a few minutes."
              : results.length > 0 || measureResults.length > 0
                ? "Here are your personalized recommendations."
                : hasStarted
                  ? "Research complete."
                  : "Preparing your guide..."}
          </p>
        </div>

        {/* Freemium gate */}
        {tierLoaded && !canAccessFeature(userTier, "research") && (
          <div className="mb-8">
            <ProGate feature="Personalized Voter Guide" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Something went wrong</p>
            <p className="mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setHasStarted(false);
              }}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Research progress */}
        {isResearching && (
          <ResearchProgress
            statuses={statuses}
            measureStatuses={measureStatuses}
          />
        )}

        {/* Per-candidate errors (when research finished but no results) */}
        {!isResearching &&
          results.length === 0 &&
          Object.values(statuses).some((s) => s.state === "error") && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">Research failed</p>
              {Object.values(statuses)
                .filter((s) => s.state === "error")
                .map((s) => (
                  <p key={s.candidateId} className="mt-1">
                    {s.name}: {s.error}
                  </p>
                ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setHasStarted(false)}
              >
                Try Again
              </Button>
            </div>
          )}

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-8 space-y-10">
            {Array.from(resultsByRace.entries()).map(
              ([raceName, candidates]) => (
                <RaceSection
                  key={raceName}
                  raceName={raceName}
                  candidates={candidates}
                />
              )
            )}
          </div>
        )}

        {/* Ballot Measure Results */}
        {measureResults.length > 0 && (
          <div className="mt-10 space-y-6">
            <h2 className="text-lg font-semibold">Ballot Measures</h2>
            {measureResults.map((m) => (
              <MeasureCard key={m.measureId} result={m} />
            ))}
          </div>
        )}

        {/* Measure research progress */}
        {isResearching &&
          Object.values(measureStatuses).some(
            (s) => s.state === "researching"
          ) && (
            <div className="mt-6 space-y-2">
              {Object.values(measureStatuses)
                .filter((s) => s.state === "researching")
                .map((s) => (
                  <div
                    key={s.measureId}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Researching: {s.title}
                  </div>
                ))}
            </div>
          )}

        {/* Share & Navigation */}
        {!isResearching &&
          (results.length > 0 || measureResults.length > 0) && (
          <div className="mt-10 border-t pt-6 space-y-4">
            {/* Share section */}
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleSaveAndShare}
                disabled={isSaving || !!shareUrl}
              >
                {isSaving
                  ? "Saving..."
                  : shareUrl
                    ? "Link Copied!"
                    : "Save & Share Guide"}
              </Button>
              {shareUrl && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-sm">
                  <span className="truncate max-w-xs">{shareUrl}</span>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(shareUrl)
                    }
                    className="shrink-0 text-xs underline underline-offset-2 hover:text-foreground"
                  >
                    Copy
                  </button>
                </div>
              )}
              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
            </div>

            {/* Nav buttons */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => router.push("/ballot")}
              >
                Edit Ballot
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setHasStarted(false);
                  setShareUrl(null);
                  skipCacheRef.current = true;
                }}
              >
                Re-run Research
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
