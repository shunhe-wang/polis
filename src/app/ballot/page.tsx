"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AddressLookup } from "@/components/ballot/address-lookup";
import { RaceEditor } from "@/components/ballot/race-editor";
import {
  hydrateValuesProfile,
  type Race,
  type BallotMeasure,
  type BallotElectionContext,
  type BallotImportMeta,
  type BallotReviewDraft,
  type ValuesProfile,
  type BallotInput,
} from "@/lib/types";
import { DEFAULT_ACCOUNT_SUMMARY, type AccountSummary } from "@/lib/freemium";
import { getAccountSummary } from "@/lib/account-client";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeSessionStorageGet,
  safeSessionStorageSet,
} from "@/lib/browser-storage";
import { saveBallotInput, syncFromSupabase } from "@/lib/persistence";
import {
  removeDraftCandidate,
  removeDraftMeasure,
  removeDraftRace,
  updateDraftCandidateName,
  updateDraftCandidateParty,
  updateDraftMeasureDescription,
  updateDraftMeasureTitle,
  updateDraftRaceName,
} from "@/lib/draft-ballot-review";
import {
  getAppliedDraftSummary,
  getBallotDraftQuality,
  getBallotDraftQualityLabel,
  getBallotDraftReviewHint,
} from "@/lib/ballot-draft-quality";

interface CivicApiResponse {
  state: string | null;
  election: BallotElectionContext | null;
  availableElections: BallotElectionContext[];
  requiresElectionSelection: boolean;
  primaryParties: string[];
  importMeta: BallotImportMeta;
  races: Race[];
  measures: BallotMeasure[];
  error: string | null;
}

function applyPrimaryPartySelection(
  races: Race[],
  party: string | null
): Race[] {
  if (!party) return races;

  return races.flatMap((race) => {
    if (!race.contestType?.toLowerCase().includes("primary")) {
      return [race];
    }

    const filteredCandidates = race.candidates.filter(
      (candidate) => candidate.party === party || candidate.party === null
    );

    if (filteredCandidates.length === 0) {
      return [];
    }

    return [{ ...race, candidates: filteredCandidates }];
  });
}

function saveBrowserBallot(key: string, value: string): boolean {
  const savedInSession = safeSessionStorageSet(key, value);
  const savedInLocal = safeLocalStorageSet(key, value);
  return savedInSession || savedInLocal;
}

export default function BallotPage() {
  const router = useRouter();
  const [valuesProfile, setValuesProfile] = useState<ValuesProfile | null>(
    null
  );
  const [address, setAddress] = useState("");
  const [addressDraft, setAddressDraft] = useState({
    streetAddress: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [state, setState] = useState<string | null>(null);
  const [election, setElection] = useState<BallotElectionContext | null>(null);
  const [availableElections, setAvailableElections] = useState<
    BallotElectionContext[]
  >([]);
  const [importMeta, setImportMeta] = useState<BallotImportMeta | null>(null);
  const [importedRaces, setImportedRaces] = useState<Race[]>([]);
  const [primaryParties, setPrimaryParties] = useState<string[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState<BallotInput | null>(null);
  const [draftSummary, setDraftSummary] = useState<BallotReviewDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isParsingDraft, setIsParsingDraft] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [returnToGuide, setReturnToGuide] = useState(false);
  const [account, setAccount] = useState<AccountSummary>(
    DEFAULT_ACCOUNT_SUMMARY
  );
  const manualLookupAddress = [
    addressDraft.streetAddress,
    addressDraft.city,
    addressDraft.state,
    addressDraft.zipCode,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams(window.location.search);
      setReturnToGuide(params.get("returnTo") === "guide");

      await syncFromSupabase();

      const stored =
        safeSessionStorageGet("valuesProfile") ??
        safeLocalStorageGet("valuesProfile");
      if (!stored) {
        router.push("/onboarding");
        return;
      }

      safeSessionStorageSet("valuesProfile", stored);

      setValuesProfile(
        hydrateValuesProfile(JSON.parse(stored) as Partial<ValuesProfile>)
      );

      const ballotStr =
        safeSessionStorageGet("ballotInput") ??
        safeLocalStorageGet("ballotInput");
      if (ballotStr) {
        safeSessionStorageSet("ballotInput", ballotStr);
        const ballot = JSON.parse(ballotStr) as BallotInput;
        setAddress(ballot.address);
        setState(ballot.state || null);
        const parts = ballot.address
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        setAddressDraft({
          streetAddress: parts[0] ?? "",
          city: parts[1] ?? "",
          state: ballot.state || "",
          zipCode: parts.at(-1)?.match(/^\d{5}$/)?.[0] ?? "",
        });
        setElection(ballot.election ?? null);
        setImportMeta(ballot.importMeta ?? null);
        setRaces(ballot.races ?? []);
        setImportedRaces(ballot.races ?? []);
        setMeasures(ballot.measures ?? []);
        setHasSearched(true);
      }

      const summary = await getAccountSummary();
      setAccount(summary);
      if (summary.isAuthenticated) {
        try {
          const response = await fetch("/api/ballot/review-draft", {
            cache: "no-store",
          });
          if (response.ok) {
            const data = await response.json();
            if (
              data &&
              typeof data === "object" &&
              "normalizedBallot" in data &&
              data.normalizedBallot
            ) {
              setDraftPreview(data.normalizedBallot as BallotInput);
              setDraftSummary(
                ("draft" in data ? data.draft : null) as BallotReviewDraft | null
              );
            }
          }
        } catch {
          // Ignore draft preload failures.
        }
      }
      setHasHydrated(true);
    }

    load();
  }, [router]);

  useEffect(() => {
    if (!hasHydrated) return;

    const ballotInput: BallotInput = {
      address,
      state: state ?? "",
      election,
      importMeta,
      races,
      measures,
    };

    saveBrowserBallot("ballotInput", JSON.stringify(ballotInput));

    const timeout = window.setTimeout(() => {
      void saveBallotInput(ballotInput);
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [address, state, election, importMeta, races, measures, hasHydrated]);

  const handleLookup = async (
    addr: string,
    selectedElectionId?: string,
    stateHint?: string
  ) => {
    setAddress(addr);
    if (stateHint) {
      setState(stateHint);
    }
    setIsLoading(true);
    setLookupError(null);
    setHasSearched(true);

    try {
      const params = new URLSearchParams({
        address: addr,
      });
      if (selectedElectionId) {
        params.set("electionId", selectedElectionId);
      }
      const res = await fetch(`/api/ballot/lookup?${params.toString()}`);
      const data: CivicApiResponse = await res.json();

      if (!res.ok) {
        setLookupError(
          data.error || "Ballot lookup is temporarily unavailable."
        );
        setState(
          (currentState) =>
            currentState ?? stateHint ?? (addressDraft.state || null)
        );
        setElection(null);
        setAvailableElections([]);
        setImportMeta(data.importMeta ?? null);
        setPrimaryParties([]);
        setImportedRaces([]);
        setRaces([]);
        setMeasures([]);
        return;
      }

      if (data.error) {
        setLookupError(data.error);
      }

      setState(data.state ?? stateHint ?? (addressDraft.state || null));
      setAvailableElections(data.availableElections ?? []);
      setImportMeta(data.importMeta ?? null);
      if (data.requiresElectionSelection) {
        setElection(null);
        setPrimaryParties([]);
        setImportedRaces([]);
        setRaces([]);
        setMeasures([]);
        return;
      }

      setElection(data.election);
      setPrimaryParties(data.primaryParties ?? []);
      setImportedRaces(data.races);
      setRaces(applyPrimaryPartySelection(data.races, data.election?.selectedParty ?? null));
      setMeasures(data.measures ?? []);
    } catch {
      setLookupError(
        "Could not connect to the ballot lookup service. You can add races manually below."
      );
      setState(
        (currentState) =>
          currentState ?? stateHint ?? (addressDraft.state || null)
      );
      setImportMeta(null);
    } finally {
      setIsLoading(false);
    }
  };

  const canContinue =
    (races.length > 0 && races.some((r) => r.candidates.length > 0)) ||
    measures.length > 0;

  const handleContinue = () => {
    if (!valuesProfile) return;

    const ballotInput: BallotInput = {
      address,
      state: state ?? "",
      election,
      importMeta,
      races,
      measures,
    };

    const saved = saveBrowserBallot("ballotInput", JSON.stringify(ballotInput));
    if (!saved) {
      setStorageError(
        "Could not save this ballot in browser storage. Keep this tab open or sign in so your progress can sync."
      );
    } else {
      setStorageError(null);
    }
    void saveBallotInput(ballotInput);
    if (!account.isAuthenticated) {
      router.push("/start?intent=guide");
      return;
    }
    router.push("/guide");
  };

  const applyDraftBallot = (draftBallot: BallotInput) => {
    const appliedImportMeta: BallotImportMeta | null = draftBallot.importMeta
      ? {
          ...draftBallot.importMeta,
          fallbackLinks:
            importMeta?.fallbackLinks ?? draftBallot.importMeta.fallbackLinks,
          locality:
            importMeta?.locality ?? draftBallot.importMeta.locality ?? null,
        }
      : importMeta;

    const nextElection = draftBallot.election
      ? {
          ...draftBallot.election,
          selectedParty:
            draftBallot.election.selectedParty ?? election?.selectedParty ?? null,
        }
      : election;

    setElection(nextElection);
    setImportMeta(appliedImportMeta);
    setImportedRaces(draftBallot.races ?? []);
    setPrimaryParties([]);
    setRaces(draftBallot.races ?? []);
    setMeasures(draftBallot.measures ?? []);
    if (draftBallot.state) {
      setState(draftBallot.state);
    }
    setHasSearched(true);
    setLookupError(null);
  };

  const handleParseDraft = async () => {
    if (!draftText.trim()) return;

    setIsParsingDraft(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/ballot/review-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ballotText: draftText,
          state: state ?? "",
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setDraftError(
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Could not parse this ballot text."
        );
        return;
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("normalizedBallot" in data) ||
        !data.normalizedBallot
      ) {
        setDraftError("Could not parse this ballot text.");
        return;
      }

      setDraftPreview(data.normalizedBallot as BallotInput);
      setDraftSummary(
        ("draft" in data ? data.draft : null) as BallotReviewDraft | null
      );
    } catch {
      setDraftError("Could not parse this ballot text.");
    } finally {
      setIsParsingDraft(false);
    }
  };

  const handleUploadDraft = async () => {
    if (!draftFile) return;

    setIsParsingDraft(true);
    setDraftError(null);
    try {
      const formData = new FormData();
      formData.set("file", draftFile);
      if (state) {
        formData.set("state", state);
      }

      const response = await fetch("/api/ballot/review-draft", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setDraftError(
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Could not parse this ballot file."
        );
        return;
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("normalizedBallot" in data) ||
        !data.normalizedBallot
      ) {
        setDraftError("Could not parse this ballot file.");
        return;
      }

      setDraftPreview(data.normalizedBallot as BallotInput);
      setDraftSummary(
        ("draft" in data ? data.draft : null) as BallotReviewDraft | null
      );
    } catch {
      setDraftError("Could not parse this ballot file.");
    } finally {
      setIsParsingDraft(false);
    }
  };

  if (!valuesProfile) {
    return null; // redirecting
  }

  const draftQuality = draftSummary
    ? getBallotDraftQuality(draftSummary.confidence)
    : null;
  const draftReviewHint =
    draftSummary && draftPreview
      ? getBallotDraftReviewHint({
          confidence: draftSummary.confidence,
          races: draftSummary.races,
          measures: draftSummary.measures,
        })
      : null;
  const appliedDraftSummary =
    importMeta?.source === "official_upload" &&
    importMeta.status !== "complete" &&
    importMeta.confidence < 80
      ? getAppliedDraftSummary({
          address,
          state: state ?? "",
          election,
          importMeta,
          races,
          measures,
        })
      : null;

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Your Ballot
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your address to find races and candidates, or add them
            manually.
          </p>
          {election && (
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {election.name} • {new Date(election.electionDay).toLocaleDateString()}
              {election.selectedParty ? ` • ${election.selectedParty} ballot` : ""}
            </p>
          )}
        </div>

        {returnToGuide && (
          <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Editing your ballot</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can go back to your guide anytime. Your current ballot is
                  already saved.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => router.push("/guide")}
              >
                Back to Guide
              </Button>
            </div>
          </div>
        )}

        {!returnToGuide && !account.isAuthenticated && (
          <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium">Guest mode stops at the ballot</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build your ballot now, then create an account to unlock
              starter analysis and buy credits when you need the full guide.
            </p>
          </div>
        )}

        {!returnToGuide && account.isAuthenticated && (
          <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium">
              {account.electionPassCredits > 0
                ? "Credits available: unlock a ballot when you are ready"
                : "Signed-in account: browse now, buy credits later"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {account.trustedAccount
                ? "Continue to the guide to browse candidate links, use your starter analysis, or spend 1 credit when this ballot is final."
                : account.trustReason ?? "Verify your email to unlock AI features."}
            </p>
            {(account.electionPassCredits > 0 ||
              account.starterAnalysesRemaining > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {account.starterAnalysesRemaining > 0 && (
                  <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
                    {account.starterAnalysesRemaining} starter analysis
                    {account.starterAnalysesRemaining === 1 ? "" : "es"}
                  </span>
                )}
                {account.electionPassCredits > 0 && (
                  <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
                    {account.electionPassCredits} election pass credit
                    {account.electionPassCredits === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Address Lookup */}
        <Card>
          <CardContent className="pt-6">
            <AddressLookup
              value={addressDraft}
              onChange={setAddressDraft}
              onLookup={handleLookup}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>

        {account.isAuthenticated && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Upload or paste ballot for review</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the official site shows your ballot but Google Civic is
                    incomplete, upload a sample-ballot PDF/image or paste the
                    ballot text here. Polis will turn it into a reviewable
                    draft you can apply below.
                  </p>
                </div>
                {!account.trustedAccount ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                    {account.trustReason ??
                      "Verify your email before using ballot text parsing."}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 rounded-lg border border-black/5 bg-background/70 p-4 dark:border-white/10">
                      <div>
                        <p className="text-sm font-medium">
                          Upload ballot PDF or image
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Best formats: official sample-ballot PDF, screenshot,
                          PNG, JPEG, or WEBP. Keep uploads under 8MB.
                        </p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          setDraftFile(event.target.files?.[0] ?? null)
                        }
                        className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={handleUploadDraft}
                          disabled={!draftFile || isParsingDraft}
                        >
                          {isParsingDraft ? "Parsing..." : "Parse Ballot File"}
                        </Button>
                        {draftFile && (
                          <p className="self-center text-xs text-muted-foreground">
                            {draftFile.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <Textarea
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      placeholder="Paste the official ballot text here. Include the election title, each race, candidate names, and any ballot measures."
                      rows={8}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={handleParseDraft}
                        disabled={!draftText.trim() || isParsingDraft}
                      >
                        {isParsingDraft ? "Parsing..." : "Parse Ballot Text"}
                      </Button>
                      {draftPreview && (
                        <Button
                          variant="outline"
                          onClick={() => applyDraftBallot(draftPreview)}
                        >
                          Apply Draft to Ballot
                        </Button>
                      )}
                    </div>
                    {draftError && (
                      <p className="text-sm text-destructive">{draftError}</p>
                    )}
                    {draftSummary && draftPreview && (
                      <div className="space-y-4 rounded-lg border border-black/5 bg-background/70 p-4 text-sm dark:border-white/10">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">Review parsed draft</p>
                        <p className="mt-1 text-muted-foreground">
                          Fix anything wrong before applying this draft to
                          your ballot. Parsed {draftPreview.races.length} race
                              {draftPreview.races.length === 1 ? "" : "s"} and{" "}
                              {draftPreview.measures.length} measure
                              {draftPreview.measures.length === 1 ? "" : "s"}.
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDraftPreview(null);
                              setDraftSummary(null);
                              setDraftText("");
                              setDraftFile(null);
                            }}
                          >
                            Discard Draft
                          </Button>
                        </div>
                        {draftSummary && (
                          <div
                            className={`rounded-lg border p-3 text-sm ${
                              draftQuality === "low"
                                ? "border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                                : draftQuality === "medium"
                                  ? "border-primary/15 bg-primary/5 text-foreground"
                                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                            }`}
                          >
                            <p className="font-medium">
                              {getBallotDraftQualityLabel(draftSummary.confidence)}
                            </p>
                            {draftReviewHint && (
                              <p className="mt-1 text-xs">
                                {draftReviewHint}
                              </p>
                            )}
                          </div>
                        )}
                        {draftSummary.notes.length > 0 && (
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {draftSummary.notes.map((note) => (
                              <li key={note}>• {note}</li>
                            ))}
                          </ul>
                        )}
                        <div className="space-y-4">
                          {draftPreview.races.map((race) => (
                            <div
                              key={race.id}
                              className="space-y-3 rounded-lg border border-black/5 bg-background/80 p-3 dark:border-white/10"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 space-y-2">
                                  <label className="text-xs font-medium text-muted-foreground">
                                    Race name
                                  </label>
                                  <Input
                                    value={race.name}
                                    onChange={(event) =>
                                      setDraftPreview((current) =>
                                        current
                                          ? updateDraftRaceName(
                                              current,
                                              race.id,
                                              event.target.value
                                            )
                                          : current
                                      )
                                    }
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDraftPreview((current) =>
                                      current
                                        ? removeDraftRace(current, race.id)
                                        : current
                                    )
                                  }
                                >
                                  Remove Race
                                </Button>
                              </div>
                              <div className="space-y-2">
                                {race.candidates.map((candidate) => (
                                  <div
                                    key={candidate.id}
                                    className="grid gap-2 rounded-md border border-black/5 p-3 dark:border-white/10 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
                                  >
                                    <Input
                                      value={candidate.name}
                                      onChange={(event) =>
                                        setDraftPreview((current) =>
                                          current
                                            ? updateDraftCandidateName(
                                                current,
                                                race.id,
                                                candidate.id,
                                                event.target.value
                                              )
                                            : current
                                        )
                                      }
                                      placeholder="Candidate name"
                                    />
                                    <Input
                                      value={candidate.party ?? ""}
                                      onChange={(event) =>
                                        setDraftPreview((current) =>
                                          current
                                            ? updateDraftCandidateParty(
                                                current,
                                                race.id,
                                                candidate.id,
                                                event.target.value
                                              )
                                            : current
                                        )
                                      }
                                      placeholder="Party"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setDraftPreview((current) =>
                                          current
                                            ? removeDraftCandidate(
                                                current,
                                                race.id,
                                                candidate.id
                                              )
                                            : current
                                        )
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {draftPreview.measures.map((measure) => (
                            <div
                              key={measure.id}
                              className="space-y-3 rounded-lg border border-black/5 bg-background/80 p-3 dark:border-white/10"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 space-y-2">
                                  <label className="text-xs font-medium text-muted-foreground">
                                    Measure title
                                  </label>
                                  <Input
                                    value={measure.title}
                                    onChange={(event) =>
                                      setDraftPreview((current) =>
                                        current
                                          ? updateDraftMeasureTitle(
                                              current,
                                              measure.id,
                                              event.target.value
                                            )
                                          : current
                                      )
                                    }
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDraftPreview((current) =>
                                      current
                                        ? removeDraftMeasure(current, measure.id)
                                        : current
                                    )
                                  }
                                >
                                  Remove Measure
                                </Button>
                              </div>
                              <Textarea
                                value={measure.description}
                                onChange={(event) =>
                                  setDraftPreview((current) =>
                                    current
                                      ? updateDraftMeasureDescription(
                                          current,
                                          measure.id,
                                          event.target.value
                                        )
                                      : current
                                  )
                                }
                                rows={4}
                                placeholder="Measure description"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => applyDraftBallot(draftPreview)}
                          >
                            Apply Draft to Ballot
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results / Error */}
        {hasSearched && !isLoading && (
          <div className="mt-6">
            {lookupError && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <p className="font-medium">Lookup note</p>
                <p className="mt-1">{lookupError}</p>
              </div>
            )}

            {storageError && (
              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <p className="font-medium">Storage note</p>
                <p className="mt-1">{storageError}</p>
              </div>
            )}

            {state && (
              <p className="mb-4 text-sm text-muted-foreground">
                Showing results for <span className="font-medium">{state}</span>
              </p>
            )}

            {importMeta && (
              <div className="mb-4 rounded-lg border border-black/5 bg-background/70 p-4 text-sm dark:border-white/10">
                <p className="font-medium">
                  {importMeta.status === "complete"
                    ? "Imported ballot"
                    : importMeta.status === "partial"
                      ? "Partial ballot import"
                      : "Ballot import unavailable"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {importMeta.message}
                </p>
                {importMeta.status !== "complete" && (
                  <div className="mt-3 rounded-lg border border-primary/10 bg-primary/5 p-3">
                    <p className="text-sm font-medium">Best next steps</p>
                    <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <li>1. Open an official election or sample-ballot link below.</li>
                      <li>2. Compare it against the races shown here.</li>
                      <li>3. Add missing races manually, or paste/upload the ballot for review above.</li>
                    </ol>
                  </div>
                )}
                {importMeta.fallbackLinks.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Official recovery links
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {importMeta.fallbackLinks.map((link) => (
                      <a
                        key={`${link.kind}-${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:bg-muted dark:border-white/10"
                      >
                        {link.label}
                      </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
                    Source: {importMeta.source.replace("_", " ")}
                  </span>
                  {importMeta.importId && (
                    <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
                      Import ID: {importMeta.importId.slice(0, 8)}
                    </span>
                  )}
                </div>
                {importMeta.status !== "complete" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    If Google Civic is missing local contests today, come back
                    later too. Election offices often publish more complete
                    sample ballots closer to election day.
                  </p>
                )}
                {appliedDraftSummary && (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
                    {appliedDraftSummary}
                  </div>
                )}
              </div>
            )}

            {availableElections.length > 1 && !election && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-medium">Choose an election</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We found multiple elections for this address. Pick the one you want before we load the ballot.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {availableElections.map((option) => (
                    <Button
                      key={option.id}
                      variant="outline"
                      className="justify-between"
                      onClick={() => handleLookup(address, option.id)}
                    >
                      <span>{option.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(option.electionDay).toLocaleDateString()}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {election && primaryParties.length > 1 && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-medium">Choose your primary ballot</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We imported candidates for multiple parties. Pick the ballot you want to evaluate.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={election.selectedParty === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setElection((current) =>
                        current ? { ...current, selectedParty: null } : current
                      );
                      setRaces(importedRaces);
                    }}
                  >
                    Show All
                  </Button>
                  {primaryParties.map((party) => (
                    <Button
                      key={party}
                      variant={election.selectedParty === party ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setElection((current) =>
                          current ? { ...current, selectedParty: party } : current
                        );
                        setRaces(applyPrimaryPartySelection(importedRaces, party));
                      }}
                    >
                      {party}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Switching ballot party resets imported primary candidates for this lookup.
                </p>
              </div>
            )}

            {races.length === 0 &&
              measures.length === 0 &&
              !lookupError &&
              availableElections.length <= 1 && (
                <div className="mb-4 rounded-lg border border-muted bg-muted/40 p-4 text-sm">
                  <p className="font-medium">No ballot data found for this address yet</p>
                  <p className="mt-1 text-muted-foreground">
                    Check back later for your ballot — election data typically
                    becomes available closer to election day. You can also add
                    races and candidates manually below.
                  </p>
                </div>
              )}

            <RaceEditor
              races={races}
              onRacesChange={setRaces}
              state={state ?? (addressDraft.state || null)}
              locality={addressDraft.city || null}
              address={address || manualLookupAddress || null}
              electionId={election?.id ?? null}
              canLookupCandidates={account.isAuthenticated && account.trustedAccount}
            />

            {/* Ballot Measures */}
            {measures.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-medium">
                  {measures.length} ballot measure{measures.length === 1 ? "" : "s"}
                </h3>
                {measures.map((m) => (
                  <Card key={m.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold">{m.title}</h4>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                            {m.description}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setMeasures(measures.filter((x) => x.id !== m.id))
                          }
                          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state — prompt to add manually if no search yet */}
        {!hasSearched && (
          <div className="mt-6">
            <p className="text-center text-sm text-muted-foreground">
              Or{" "}
              <button
                onClick={() => setHasSearched(true)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                skip lookup and add races manually
              </button>
            </p>
          </div>
        )}

        {/* Continue */}
        <div className="mt-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => router.push("/onboarding?step=4")}
            >
              Back
            </Button>
            {returnToGuide && (
              <Button
                variant="outline"
                onClick={() => router.push("/guide")}
              >
                Back to Guide
              </Button>
            )}
          </div>
          <Button onClick={handleContinue} disabled={!canContinue}>
            {returnToGuide
              ? "Update Guide"
              : !account.isAuthenticated
                ? "Create Account to Open Guide"
                : account.trustedAccount
                  ? "Browse Candidates & Open Guide"
                  : "Verify Email to Unlock Guide Features"}
          </Button>
        </div>

        {hasSearched && !canContinue && races.length > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Add at least one candidate to a race to continue.
          </p>
        )}
      </div>
    </main>
  );
}
