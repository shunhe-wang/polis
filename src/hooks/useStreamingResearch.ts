"use client";

import { useState, useCallback, useRef } from "react";
import type {
  ValuesProfile,
  BallotInput,
  CandidateResult,
  MeasureResult,
} from "@/lib/types";

type StreamEventType =
  | "candidate_start"
  | "candidate_progress"
  | "candidate_result"
  | "candidate_error"
  | "measure_start"
  | "measure_progress"
  | "measure_result"
  | "measure_error"
  | "done";

interface StreamEvent {
  type: StreamEventType;
  candidateId?: string;
  measureId?: string;
  name?: string;
  title?: string;
  race?: string;
  text?: string;
  result?: CandidateResult;
  measureResult?: MeasureResult;
  error?: string;
}

export interface CandidateStatus {
  candidateId: string;
  name: string;
  race: string;
  state: "researching" | "complete" | "error";
  progressText: string;
  result: CandidateResult | null;
  error: string | null;
}

export interface MeasureStatus {
  measureId: string;
  title: string;
  state: "researching" | "complete" | "error";
  progressText: string;
  result: MeasureResult | null;
  error: string | null;
}

interface UseStreamingResearchReturn {
  statuses: Record<string, CandidateStatus>;
  measureStatuses: Record<string, MeasureStatus>;
  results: CandidateResult[];
  measureResults: MeasureResult[];
  isResearching: boolean;
  error: string | null;
  startResearch: (
    valuesProfile: ValuesProfile,
    ballotInput: BallotInput,
    options?: { skipCache?: boolean }
  ) => void;
  stopResearch: () => void;
}

function buildCacheKey(
  valuesProfile: ValuesProfile,
  ballotInput: BallotInput
): string {
  const profileHash = JSON.stringify(valuesProfile);
  const ballotHash = JSON.stringify(ballotInput);
  return `research_cache_${btoa(profileHash + ballotHash).slice(0, 64)}`;
}

function getCachedResults(
  valuesProfile: ValuesProfile,
  ballotInput: BallotInput
): CachedData | null {
  try {
    const key = buildCacheKey(valuesProfile, ballotInput);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as unknown;

    if (Array.isArray(parsed)) {
      return {
        results: parsed as CandidateResult[],
        measureResults: [],
      };
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "results" in parsed &&
      "measureResults" in parsed &&
      Array.isArray(parsed.results) &&
      Array.isArray(parsed.measureResults)
    ) {
      return parsed as CachedData;
    }

    return null;
  } catch {
    return null;
  }
}

interface CachedData {
  results: CandidateResult[];
  measureResults: MeasureResult[];
}

function setCachedResults(
  valuesProfile: ValuesProfile,
  ballotInput: BallotInput,
  data: CachedData
): void {
  try {
    const key = buildCacheKey(valuesProfile, ballotInput);
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // sessionStorage may be full — ignore
  }
}

export function useStreamingResearch(): UseStreamingResearchReturn {
  const [statuses, setStatuses] = useState<Record<string, CandidateStatus>>(
    {}
  );
  const [measureStatuses, setMeasureStatuses] = useState<
    Record<string, MeasureStatus>
  >({});
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [measureResults, setMeasureResults] = useState<MeasureResult[]>([]);
  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopResearch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsResearching(false);
  }, []);

  const startResearch = useCallback(
    async (
      valuesProfile: ValuesProfile,
      ballotInput: BallotInput,
      options?: { skipCache?: boolean }
    ) => {
      const expectedCandidateCount = ballotInput.races.reduce(
        (total, race) => total + race.candidates.length,
        0
      );
      const expectedMeasureCount = ballotInput.measures.length;

      // Check cache first (unless explicitly skipping)
      if (!options?.skipCache) {
        const cached = getCachedResults(valuesProfile, ballotInput);
        if (cached) {
          const cacheMatchesRequest =
            cached.results.length === expectedCandidateCount &&
            cached.measureResults.length === expectedMeasureCount;

          if (cacheMatchesRequest) {
            const cachedStatuses: Record<string, CandidateStatus> = {};
            for (const r of cached.results) {
              cachedStatuses[r.candidateId] = {
                candidateId: r.candidateId,
                name: r.name,
                race: r.race,
                state: "complete",
                progressText: "",
                result: r,
                error: null,
              };
            }
            const cachedMeasureStatuses: Record<string, MeasureStatus> = {};
            for (const m of cached.measureResults) {
              cachedMeasureStatuses[m.measureId] = {
                measureId: m.measureId,
                title: m.title,
                state: "complete",
                progressText: "",
                result: m,
                error: null,
              };
            }
            setStatuses(cachedStatuses);
            setMeasureStatuses(cachedMeasureStatuses);
            setResults(cached.results);
            setMeasureResults(cached.measureResults);
            setIsResearching(false);
            setError(null);
            return;
          }
        }
      }

      // Abort any previous research
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      setStatuses({});
      setMeasureStatuses({});
      setResults([]);
      setMeasureResults([]);
      setIsResearching(true);
      setError(null);

      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valuesProfile, ballotInput }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          const message =
            errData && typeof errData === "object" && "error" in errData
              ? String(errData.error)
              : `Request failed with status ${response.status}`;
          setError(message);
          setIsResearching(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setError("No response stream available");
          setIsResearching(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        const collectedResults: CandidateResult[] = [];
        const collectedMeasureResults: MeasureResult[] = [];
        let hasFailures = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(line) as StreamEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "candidate_start":
                if (event.candidateId && event.name && event.race) {
                  setStatuses((prev) => ({
                    ...prev,
                    [event.candidateId!]: {
                      candidateId: event.candidateId!,
                      name: event.name!,
                      race: event.race!,
                      state: "researching",
                      progressText: "",
                      result: null,
                      error: null,
                    },
                  }));
                }
                break;

              case "candidate_progress":
                if (event.candidateId && event.text !== undefined) {
                  setStatuses((prev) => {
                    const existing = prev[event.candidateId!];
                    if (!existing) return prev;
                    return {
                      ...prev,
                      [event.candidateId!]: {
                        ...existing,
                        progressText: event.text!,
                      },
                    };
                  });
                }
                break;

              case "candidate_result":
                if (event.candidateId && event.result) {
                  const result = event.result;
                  setStatuses((prev) => {
                    const existing = prev[event.candidateId!];
                    if (!existing) return prev;
                    return {
                      ...prev,
                      [event.candidateId!]: {
                        ...existing,
                        state: "complete",
                        result,
                      },
                    };
                  });
                  setResults((prev) => [...prev, result]);
                  collectedResults.push(result);
                }
                break;

              case "candidate_error":
                if (event.candidateId) {
                  hasFailures = true;
                  setStatuses((prev) => {
                    const existing = prev[event.candidateId!];
                    if (!existing) return prev;
                    return {
                      ...prev,
                      [event.candidateId!]: {
                        ...existing,
                        state: "error",
                        error: event.error ?? "Unknown error",
                      },
                    };
                  });
                }
                break;

              case "measure_start":
                if (event.measureId && event.title) {
                  setMeasureStatuses((prev) => ({
                    ...prev,
                    [event.measureId!]: {
                      measureId: event.measureId!,
                      title: event.title!,
                      state: "researching",
                      progressText: "",
                      result: null,
                      error: null,
                    },
                  }));
                }
                break;

              case "measure_progress":
                if (event.measureId && event.text !== undefined) {
                  setMeasureStatuses((prev) => {
                    const existing = prev[event.measureId!];
                    if (!existing) return prev;
                    return {
                      ...prev,
                      [event.measureId!]: {
                        ...existing,
                        progressText: event.text!,
                      },
                    };
                  });
                }
                break;

              case "measure_result":
                if (event.measureId) {
                  // The result comes as 'result' in the NDJSON
                  const mResult = (event.result ??
                    event.measureResult) as unknown as MeasureResult;
                  if (mResult) {
                    setMeasureStatuses((prev) => {
                      const existing = prev[event.measureId!];
                      if (!existing) return prev;
                      return {
                        ...prev,
                        [event.measureId!]: {
                          ...existing,
                          state: "complete",
                          result: mResult,
                        },
                      };
                    });
                    setMeasureResults((prev) => [...prev, mResult]);
                    collectedMeasureResults.push(mResult);
                  }
                }
                break;

              case "measure_error":
                if (event.measureId) {
                  hasFailures = true;
                  setMeasureStatuses((prev) => {
                    const existing = prev[event.measureId!];
                    if (!existing) return prev;
                    return {
                      ...prev,
                      [event.measureId!]: {
                        ...existing,
                        state: "error",
                        error: event.error ?? "Unknown error",
                      },
                    };
                  });
                }
                break;

              case "done":
                setIsResearching(false);
                break;
            }
          }
        }

        // Cache only complete successful runs. Partial caches trap the user
        // in incomplete guides on subsequent loads.
        if (
          !hasFailures &&
          collectedResults.length === expectedCandidateCount &&
          collectedMeasureResults.length === expectedMeasureCount &&
          (collectedResults.length > 0 || collectedMeasureResults.length > 0)
        ) {
          setCachedResults(valuesProfile, ballotInput, {
            results: collectedResults,
            measureResults: collectedMeasureResults,
          });
        }
        setIsResearching(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setIsResearching(false);
          return;
        }
        setError(
          err instanceof Error ? err.message : "Research request failed"
        );
        setIsResearching(false);
      }
    },
    []
  );

  return {
    statuses,
    measureStatuses,
    results,
    measureResults,
    isResearching,
    error,
    startResearch,
    stopResearch,
  };
}
