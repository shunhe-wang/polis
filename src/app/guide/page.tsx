"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ResearchProgress } from "@/components/guide/research-progress";
import { RaceSection } from "@/components/guide/race-section";
import { MeasureCard } from "@/components/guide/measure-card";
import { PollsCompanion } from "@/components/guide/polls-companion";
import { FreeGuideBrowser } from "@/components/guide/free-guide-browser";
import { CollapsibleContent } from "@/components/guide/collapsible-content";
import { useStreamingResearch } from "@/hooks/useStreamingResearch";
import {
  DEFAULT_ACCOUNT_SUMMARY,
  type AccountSummary,
} from "@/lib/freemium";
import { getAccountSummary } from "@/lib/account-client";
import { safeSessionStorageGet, safeSessionStorageSet } from "@/lib/browser-storage";
import { syncFromSupabase } from "@/lib/persistence";
import { buildRaceRecommendation } from "@/lib/race-recommendations";
import { rankRaceCandidates } from "@/lib/race-recommendations";
import type {
  ValuesProfile,
  BallotInput,
  CandidateResult,
  RaceRecommendation,
  Race,
  Candidate,
} from "@/lib/types";
import { hydrateValuesProfile } from "@/lib/types";
import Link from "next/link";

interface GuideAccessState {
  unlocked: boolean;
  canUnlock: boolean;
  source: "existing" | "election_pass" | "power_pass" | null;
  electionPassCredits: number;
  powerPassRunsRemaining: number;
  powerPassExpiresAt: string | null;
  requiresAuth?: boolean;
}

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
  const [storageError, setStorageError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountSummary>(
    DEFAULT_ACCOUNT_SUMMARY
  );
  const [tierLoaded, setTierLoaded] = useState(false);
  const [starterResult, setStarterResult] =
    useState<CandidateResult | null>(null);
  const [starterError, setStarterError] = useState<string | null>(null);
  const [analyzingCandidateId, setAnalyzingCandidateId] = useState<
    string | null
  >(null);
  const [measuresCollapsed, setMeasuresCollapsed] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [pollsMode, setPollsMode] = useState(false);
  const [guideAccess, setGuideAccess] = useState<GuideAccessState | null>(null);
  const prefetchedBallotKeysRef = useRef<Set<string>>(new Set());

  const {
    statuses,
    measureStatuses,
    results,
    measureResults,
    isResearching,
    error,
    startResearch,
    stopResearch,
  } = useStreamingResearch();

  // Load data from sessionStorage (with Supabase fallback) and check tier
  useEffect(() => {
    async function load() {
      // Try to sync from Supabase if sessionStorage is empty
      await syncFromSupabase();

      const profileStr = safeSessionStorageGet("valuesProfile");
      const ballotStr = safeSessionStorageGet("ballotInput");

      if (!profileStr || !ballotStr) {
        router.push("/onboarding");
        return;
      }

      setValuesProfile(
        hydrateValuesProfile(JSON.parse(profileStr) as Partial<ValuesProfile>)
      );
      const parsedBallot = JSON.parse(ballotStr) as BallotInput;
      setBallotInput(parsedBallot);

      const summary = await getAccountSummary();
      setAccount(summary);
      setTierLoaded(true);

      if (summary.isAuthenticated) {
        try {
          const accessResponse = await fetch("/api/guide-access", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ballotInput: parsedBallot, action: "status" }),
          });
          if (accessResponse.ok) {
            const access = (await accessResponse.json()) as GuideAccessState;
            setGuideAccess(access);
          }
        } catch {
          // Ignore guide-access preload failures.
        }
      }

      if (summary.tier === "free" || summary.tier === "pro") {
        try {
          const starterResponse = await fetch("/api/starter-analysis", {
            cache: "no-store",
          });
          if (starterResponse.ok) {
            const starterData = await starterResponse.json();
            if (
              starterData &&
              typeof starterData === "object" &&
              "result" in starterData &&
              starterData.result
            ) {
              const result = starterData.result as CandidateResult;
              const stillOnBallot = parsedBallot.races.some((race) =>
                race.candidates.some(
                  (candidate) => candidate.id === result.candidateId
                )
              );
              if (stillOnBallot) {
                setStarterResult(result);
              }
            }
          }
        } catch {
          // Ignore starter-analysis preload failures.
        }
      }
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
      !!guideAccess?.unlocked
    ) {
      setHasStarted(true);
      startResearch(valuesProfile, ballotInput);
    }
  }, [
    valuesProfile,
    ballotInput,
    hasStarted,
    startResearch,
    tierLoaded,
    guideAccess?.unlocked,
  ]);

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

  const raceIdByCandidateId = useMemo(() => {
    const map = new Map<string, string>();
    if (!ballotInput) return map;

    for (const race of ballotInput.races) {
      for (const candidate of race.candidates) {
        map.set(candidate.id, race.id);
      }
    }

    return map;
  }, [ballotInput]);

  const sectionLinks = useMemo(() => {
    const links = ballotInput
      ? ballotInput.races.map((race) => ({
          id: `race-${race.id}`,
          label: race.name,
        }))
      : [];

    if ((measureResults.length > 0 || ballotInput?.measures.length) && ballotInput) {
      links.push({ id: "ballot-measures", label: "Measures" });
    }

    return links;
  }, [ballotInput, measureResults.length]);

  const pollsCompanionRaces = useMemo(
    () =>
      Array.from(resultsByRace.entries()).map(([raceName, candidates]) => {
        const ranked = rankRaceCandidates(candidates);
        return {
          id:
            ballotInput?.races.find((race) => race.name === raceName)?.id ??
            raceName,
          raceName,
          recommended: ranked.recommended,
          runnerUp: ranked.runnerUp,
          explanation: ranked.explanation,
          hasCloseCall: ranked.hasCloseCall,
        };
      }),
    [ballotInput, resultsByRace]
  );

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
      const raceId =
        raceIdByCandidateId.get(candidates[0].candidateId) ?? raceName;
      recommendations.push(
        buildRaceRecommendation({
          raceId,
          raceName,
          candidates,
        })
      );
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
            : res.status === 401
              ? "Sign in to save and share your guide."
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
  }, [valuesProfile, ballotInput, results, measureResults, raceIdByCandidateId]);

  useEffect(() => {
    if (
      !tierLoaded ||
      !ballotInput ||
      !account.isAuthenticated ||
      !account.trustedAccount ||
      !guideAccess ||
      guideAccess?.unlocked
    ) {
      return;
    }

    const itemCount =
      ballotInput.races.reduce(
        (total, race) => total + race.candidates.length,
        0
      ) + ballotInput.measures.length;
    if (itemCount === 0 || ballotInput.importMeta?.status === "unavailable") {
      return;
    }

    const ballotKey = JSON.stringify({
      address: ballotInput.address,
      state: ballotInput.state,
      electionId: ballotInput.election?.id ?? null,
      itemCount,
    });
    if (prefetchedBallotKeysRef.current.has(ballotKey)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      prefetchedBallotKeysRef.current.add(ballotKey);
      void fetch("/api/research/prefetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ballotInput }),
      }).catch(() => {
        prefetchedBallotKeysRef.current.delete(ballotKey);
      });
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [
    tierLoaded,
    ballotInput,
    account.isAuthenticated,
    account.trustedAccount,
    guideAccess,
    guideAccess?.unlocked,
  ]);

  const handleStarterAnalysis = useCallback(
    async (candidate: Candidate, race: Race) => {
      if (!valuesProfile || !ballotInput) return;

      setStarterError(null);
      setAnalyzingCandidateId(candidate.id);

      try {
        const response = await fetch("/api/starter-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valuesProfile,
            candidate,
            race,
            state: ballotInput.state,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            data && typeof data === "object" && "error" in data
              ? String(data.error)
              : "Starter analysis failed";
          setStarterError(message);
          return;
        }

        if (
          !data ||
          typeof data !== "object" ||
          !("result" in data) ||
          !data.result
        ) {
          setStarterError("Starter analysis returned no result.");
          return;
        }

        const nextResult = data.result as CandidateResult;
        setStarterResult(nextResult);
        setAccount((current) => ({
          ...current,
          starterAnalysesRemaining:
            typeof data.starterAnalysesRemaining === "number"
              ? data.starterAnalysesRemaining
              : current.starterAnalysesRemaining,
        }));
      } catch {
        setStarterError("Starter analysis failed. Please try again.");
      } finally {
        setAnalyzingCandidateId(null);
      }
    },
    [valuesProfile, ballotInput]
  );

  const goToAuth = useCallback(
    (path: string) => {
      const saved = safeSessionStorageSet("authReturnTo", "/guide");
      if (!saved) {
        setStorageError(
          "Could not save your return path in browser storage. You may need to come back to the guide manually after signing in."
        );
      }
      router.push(path);
    },
    [router]
  );

  const goToBallotEditor = useCallback(() => {
    router.push("/ballot?returnTo=guide");
  }, [router]);

  const handleUnlockGuide = useCallback(async () => {
    if (!ballotInput || !account.trustedAccount) return;

    setSaveError(null);
    const confirmed = window.confirm(
      guideAccess?.powerPassRunsRemaining &&
        guideAccess.powerPassRunsRemaining > 0
        ? "Unlock this ballot and use 1 Power Pass run?"
        : "Unlock this ballot and consume 1 Election Pass credit?"
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch("/api/guide-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ballotInput, action: "unlock" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setSaveError(
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Could not unlock this ballot."
        );
        return;
      }

      if (
        data &&
        typeof data === "object" &&
        "unlocked" in data &&
        data.unlocked
      ) {
        setGuideAccess(data as GuideAccessState);
        setAccount((current) => ({
          ...current,
          tier: "pro",
          planKey:
            (data.source === "power_pass" ? "power_14d" : "election_pass"),
          planLabel:
            data.source === "power_pass" ? "Power Pass" : "Election Pass",
          electionPassCredits:
            typeof data.electionPassCredits === "number"
              ? data.electionPassCredits
              : current.electionPassCredits,
          powerPassRunsRemaining:
            typeof data.powerPassRunsRemaining === "number"
              ? data.powerPassRunsRemaining
              : current.powerPassRunsRemaining,
          powerPassExpiresAt:
            typeof data.powerPassExpiresAt === "string" ||
            data.powerPassExpiresAt === null
              ? data.powerPassExpiresAt
              : current.powerPassExpiresAt,
        }));
        setHasStarted(false);
      }
    } catch {
      setSaveError("Could not unlock this ballot.");
    }
  }, [account.trustedAccount, ballotInput, guideAccess?.powerPassRunsRemaining]);

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
            {!tierLoaded
              ? "Preparing your guide..."
              : !account.trustedAccount && account.tier !== "guest"
                ? account.trustReason ??
                  "Verify your email before starter analysis, passes, or full guide research will run."
              : guideAccess?.unlocked && isResearching
              ? "Sit tight — we're doing deep research on each item to give you comprehensive, cited results. This may take a few minutes."
              : guideAccess?.unlocked &&
                  (results.length > 0 || measureResults.length > 0)
                ? "Here are your personalized recommendations."
                : guideAccess?.canUnlock
                  ? "This ballot is ready for a paid unlock. Use a pass to run the full guide, or keep browsing links below."
                : account.tier === "free"
                  ? account.starterAnalysesRemaining > 0
                    ? "Browse your ballot, open source links, and use your free starter analysis on one candidate."
                    : "Browse your ballot and open source links. Your free starter analysis has already been used."
                  : account.tier === "guest"
                    ? "Browse your ballot now, then create a free account to unlock one starter candidate analysis."
                  : hasStarted
                    ? "Research complete."
                    : "Preparing your guide..."}
          </p>
          {tierLoaded && (
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {account.planLabel}
              {account.tier === "free"
                ? ` • ${account.starterAnalysesRemaining} starter analysis left`
                : ""}
            </p>
          )}
          {ballotInput.election && (
            <p className="mt-3 text-sm text-muted-foreground">
              {ballotInput.election.name} on{" "}
              {new Date(ballotInput.election.electionDay).toLocaleDateString()}
              {ballotInput.election.selectedParty
                ? ` • ${ballotInput.election.selectedParty} ballot`
                : ""}
            </p>
          )}
          {tierLoaded && (
            <div className="mx-auto mt-5 max-w-3xl rounded-[1.5rem] border border-black/5 bg-white/72 p-4 text-left shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Access Status
                  </p>
                  <p className="text-base font-semibold text-foreground">
                    {guideAccess?.unlocked
                      ? "Full guide unlocked for this ballot"
                      : account.tier === "guest"
                        ? "Guest mode: ballot only"
                        : account.tier === "free"
                          ? "Free mode: links plus 1 starter analysis"
                          : "Paid pass available but not spent on this ballot yet"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {guideAccess?.unlocked
                      ? "This ballot can run full personalized research, measures, and save/share."
                      : guideAccess?.canUnlock
                        ? "You already have paid unlocks available. Spend one only when this ballot is final."
                        : account.trustReason ??
                          "Browse links first. Upgrade or spend a pass only when you want the full synthesis."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {account.tier === "free" && (
                    <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
                      {account.starterAnalysesRemaining} starter analysis left
                    </span>
                  )}
                  {account.electionPassCredits > 0 && (
                    <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
                      {account.electionPassCredits} election pass credit
                      {account.electionPassCredits === 1 ? "" : "s"}
                    </span>
                  )}
                  {account.powerPassRunsRemaining > 0 && (
                    <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
                      {account.powerPassRunsRemaining} power pass run
                      {account.powerPassRunsRemaining === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {tierLoaded && (
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={goToBallotEditor}>
                Edit Ballot
              </Button>
              {!guideAccess?.unlocked && guideAccess?.canUnlock && account.trustedAccount && (
                <Button
                  className="bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white"
                  onClick={handleUnlockGuide}
                >
                  {guideAccess.powerPassRunsRemaining > 0
                    ? "Unlock with Power Pass"
                    : "Unlock with Election Pass"}
                </Button>
              )}
              {!guideAccess?.unlocked && !guideAccess?.canUnlock && account.tier !== "guest" && account.trustedAccount && (
                <Link href="/pricing">
                  <Button className="bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white">
                    See Passes
                  </Button>
                </Link>
              )}
              {guideAccess?.unlocked && (
                <Button
                  variant="outline"
                  onClick={() => setCompactMode((current) => !current)}
                >
                  {compactMode ? "Expanded View" : "Compact View"}
                </Button>
              )}
              {guideAccess?.unlocked &&
                (results.length > 0 || measureResults.length > 0) && (
                  <Button
                    variant="outline"
                    onClick={() => setPollsMode((current) => !current)}
                  >
                    {pollsMode ? "Full Guide" : "Take to Polls"}
                  </Button>
                )}
            </div>
          )}
          {storageError && (
            <p className="mt-3 text-sm text-yellow-700 dark:text-yellow-300">
              {storageError}
            </p>
          )}
        </div>

        {tierLoaded && account.tier === "guest" && (
          <div className="rounded-[1.5rem] border border-primary/20 bg-primary/5 p-6 text-center">
            <h2 className="text-lg font-semibold">Create an account to unlock the guide</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Guest mode stops at ballot building. Sign in to pick up where you
              left off, or create a free account for candidate links and one
              starter analysis.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Button onClick={() => goToAuth("/auth/signup")}>Create Free Account</Button>
              <Button variant="outline" onClick={() => goToAuth("/auth/login")}>
                Sign In
              </Button>
              <Button variant="ghost" onClick={goToBallotEditor}>
                Back to Ballot
              </Button>
            </div>
          </div>
        )}

        {tierLoaded && !account.trustedAccount && account.tier !== "guest" && (
          <div className="mb-6 rounded-[1.5rem] border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">Verify this account before using AI or paid unlocks</p>
            <p className="mt-1">
              {account.trustReason ??
                "Starter analysis, passes, and full guide research require a verified non-disposable email."}
            </p>
          </div>
        )}

        {/* Error state */}
        {guideAccess?.unlocked && error && (
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

        {/* Free tier candidate browser */}
        {tierLoaded && account.tier !== "guest" && !guideAccess?.unlocked && (
          <FreeGuideBrowser
            ballotInput={ballotInput}
            userTier={account.tier}
            trustedAccount={account.trustedAccount}
            trustReason={account.trustReason}
            starterAnalysesRemaining={account.starterAnalysesRemaining}
            starterResult={starterResult}
            starterError={starterError}
            analyzingCandidateId={analyzingCandidateId}
            onAnalyzeCandidate={handleStarterAnalysis}
            onSignUp={() => goToAuth("/auth/signup")}
            onSignIn={() => goToAuth("/auth/login")}
            onEditBallot={goToBallotEditor}
          />
        )}

        {/* Research progress */}
        {guideAccess?.unlocked && isResearching && (
          <div className="space-y-4">
            <ResearchProgress
              statuses={statuses}
              measureStatuses={measureStatuses}
            />
            <div className="flex justify-center">
              <Button variant="outline" onClick={stopResearch}>
                Stop Research
              </Button>
            </div>
          </div>
        )}

        {/* Per-candidate errors (when research finished but no results) */}
        {guideAccess?.unlocked &&
          !isResearching &&
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

        {guideAccess?.unlocked &&
          pollsMode &&
          (pollsCompanionRaces.length > 0 || measureResults.length > 0) && (
            <PollsCompanion
              heading="Your Quick Ballot"
              subheading={
                ballotInput.election
                  ? `${ballotInput.election.name} • ${new Date(
                      ballotInput.election.electionDay
                    ).toLocaleDateString()}`
                  : ballotInput.state || null
              }
              races={pollsCompanionRaces}
              measures={measureResults}
              onExit={() => setPollsMode(false)}
            />
          )}

        {/* Results */}
        {guideAccess?.unlocked && !pollsMode && results.length > 0 && (
          <div className="mt-8 space-y-10">
            {sectionLinks.length > 1 && (
              <div className="sticky top-16 z-10 -mb-4 overflow-x-auto rounded-full border border-black/5 bg-background/85 px-3 py-2 backdrop-blur dark:border-white/10">
                <div className="flex min-w-max gap-2">
                  {sectionLinks.map((link) => (
                    <a
                      key={link.id}
                      href={`#${link.id}`}
                      className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground dark:border-white/10"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {Array.from(resultsByRace.entries()).map(
              ([raceName, candidates]) => (
                <RaceSection
                  key={`${raceName}-${compactMode ? "compact" : "expanded"}`}
                  sectionId={`race-${ballotInput.races.find((race) => race.name === raceName)?.id ?? raceName}`}
                  raceName={raceName}
                  candidates={candidates}
                  compactMode={compactMode}
                />
              )
            )}
          </div>
        )}

        {/* Ballot Measure Results */}
        {guideAccess?.unlocked &&
          !pollsMode &&
          measureResults.length > 0 && (
          <div
            id="ballot-measures"
            className="mt-10 scroll-mt-28 rounded-[1.75rem] border border-black/5 bg-white/72 p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Ballot Measures</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Collapse this section to move quickly between candidate races and ballot measures.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMeasuresCollapsed((current) => !current)}
                className="rounded-full"
              >
                {measuresCollapsed ? "Expand" : "Collapse"}
              </Button>
            </div>
            <CollapsibleContent open={!measuresCollapsed}>
              <div className="space-y-6">
                {measureResults.map((m) => (
                  <MeasureCard key={m.measureId} result={m} />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        )}

        {/* Measure research progress */}
        {guideAccess?.unlocked &&
          isResearching &&
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
        {guideAccess?.unlocked &&
          !isResearching &&
          !pollsMode &&
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
                onClick={goToBallotEditor}
              >
                Edit Ballot
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
