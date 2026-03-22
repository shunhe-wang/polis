import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BallotInput,
  CandidateResult,
  MeasureResult,
  ValuesProfile,
} from "@/lib/types";

const RESEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function buildResearchCacheKey(
  valuesProfile: ValuesProfile,
  ballotInput: BallotInput
): string {
  return createHash("sha256")
    .update(JSON.stringify(valuesProfile))
    .update("\n")
    .update(JSON.stringify(ballotInput))
    .digest("hex");
}

export function buildStarterAnalysisHashes(
  valuesProfile: ValuesProfile,
  ballotInput: BallotInput
): { valuesProfileHash: string; ballotHash: string } {
  return {
    valuesProfileHash: createHash("sha256")
      .update(JSON.stringify(valuesProfile))
      .digest("hex"),
    ballotHash: createHash("sha256")
      .update(JSON.stringify(ballotInput))
      .digest("hex"),
  };
}

export function buildBallotHash(ballotInput: BallotInput): string {
  return createHash("sha256")
    .update(JSON.stringify(ballotInput))
    .digest("hex");
}

export interface ResearchCacheEntry {
  results: CandidateResult[];
  measureResults: MeasureResult[];
}

export async function loadResearchCache(
  supabase: SupabaseClient,
  cacheKey: string
): Promise<ResearchCacheEntry | null> {
  const { data, error } = await supabase
    .from("research_cache_entries")
    .select("results, measure_results, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return {
    results: Array.isArray(data.results)
      ? (data.results as CandidateResult[])
      : [],
    measureResults: Array.isArray(data.measure_results)
      ? (data.measure_results as MeasureResult[])
      : [],
  };
}

export async function saveResearchCache(
  supabase: SupabaseClient,
  userId: string,
  cacheKey: string,
  data: ResearchCacheEntry
): Promise<void> {
  const expiresAt = new Date(Date.now() + RESEARCH_CACHE_TTL_MS).toISOString();
  const { error } = await supabase.from("research_cache_entries").upsert(
    {
      user_id: userId,
      cache_key: cacheKey,
      results: data.results,
      measure_results: data.measureResults,
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: "user_id,cache_key" }
  );

  if (error) {
    throw new Error(`Failed to persist research cache: ${error.message}`);
  }
}
