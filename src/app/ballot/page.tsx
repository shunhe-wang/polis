"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddressLookup } from "@/components/ballot/address-lookup";
import { RaceEditor } from "@/components/ballot/race-editor";
import {
  hydrateValuesProfile,
  type Race,
  type BallotMeasure,
  type ValuesProfile,
  type BallotInput,
} from "@/lib/types";
import { saveBallotInput, syncFromSupabase } from "@/lib/persistence";

interface CivicApiResponse {
  state: string | null;
  races: Race[];
  measures: BallotMeasure[];
  error: string | null;
}

export default function BallotPage() {
  const router = useRouter();
  const [valuesProfile, setValuesProfile] = useState<ValuesProfile | null>(
    null
  );
  const [address, setAddress] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [returnToGuide, setReturnToGuide] = useState(false);

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams(window.location.search);
      setReturnToGuide(params.get("returnTo") === "guide");

      await syncFromSupabase();

      const stored = sessionStorage.getItem("valuesProfile");
      if (!stored) {
        router.push("/onboarding");
        return;
      }

      setValuesProfile(
        hydrateValuesProfile(JSON.parse(stored) as Partial<ValuesProfile>)
      );

      const ballotStr = sessionStorage.getItem("ballotInput");
      if (ballotStr) {
        const ballot = JSON.parse(ballotStr) as BallotInput;
        setAddress(ballot.address);
        setState(ballot.state || null);
        setRaces(ballot.races ?? []);
        setMeasures(ballot.measures ?? []);
        setHasSearched(true);
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
      races,
      measures,
    };

    sessionStorage.setItem("ballotInput", JSON.stringify(ballotInput));

    const timeout = window.setTimeout(() => {
      void saveBallotInput(ballotInput);
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [address, state, races, measures, hasHydrated]);

  const handleLookup = async (addr: string) => {
    setAddress(addr);
    setIsLoading(true);
    setLookupError(null);
    setHasSearched(true);

    try {
      const res = await fetch(
        `/api/civic?address=${encodeURIComponent(addr)}`
      );
      const data: CivicApiResponse = await res.json();

      if (!res.ok) {
        setLookupError(
          data.error || "Ballot lookup is temporarily unavailable."
        );
        setState(null);
        setRaces([]);
        setMeasures([]);
        return;
      }

      if (data.error) {
        setLookupError(data.error);
      }

      setState(data.state);
      setRaces(data.races);
      setMeasures(data.measures ?? []);
    } catch {
      setLookupError(
        "Could not connect to the ballot lookup service. You can add races manually below."
      );
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
      races,
      measures,
    };

    sessionStorage.setItem("ballotInput", JSON.stringify(ballotInput));
    void saveBallotInput(ballotInput);
    router.push("/guide");
  };

  if (!valuesProfile) {
    return null; // redirecting
  }

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

        {/* Address Lookup */}
        <Card>
          <CardContent className="pt-6">
            <AddressLookup onLookup={handleLookup} isLoading={isLoading} />
          </CardContent>
        </Card>

        {/* Results / Error */}
        {hasSearched && !isLoading && (
          <div className="mt-6">
            {lookupError && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <p className="font-medium">Lookup note</p>
                <p className="mt-1">{lookupError}</p>
                <p className="mt-2 text-xs">
                  You can manually add races and candidates below.
                </p>
              </div>
            )}

            {state && (
              <p className="mb-4 text-sm text-muted-foreground">
                Showing results for <span className="font-medium">{state}</span>
              </p>
            )}

            <RaceEditor races={races} onRacesChange={setRaces} state={state} />

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
            <Button variant="ghost" onClick={() => router.push("/onboarding")}>
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
            {returnToGuide ? "Update Guide" : "Generate Voter Guide"}
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
