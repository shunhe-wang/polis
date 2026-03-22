import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateResult, MeasureResult } from "@/lib/types";

const ITEM_CACHE_TTL_MS = 21 * 24 * 60 * 60 * 1000;

function hashKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export function buildCandidatePersonalizationCacheKey(input: {
  dossierKey: string;
  valuesProfileHash: string;
  mode: "starter" | "full";
}): string {
  return hashKey([
    "candidate_personalization_v1",
    input.dossierKey,
    input.valuesProfileHash,
    input.mode,
  ]);
}

export function buildMeasurePersonalizationCacheKey(input: {
  dossierKey: string;
  valuesProfileHash: string;
}): string {
  return hashKey([
    "measure_personalization_v1",
    input.dossierKey,
    input.valuesProfileHash,
  ]);
}

async function loadItemCache<T>(
  supabase: SupabaseClient,
  kind: "candidate" | "measure",
  cacheKey: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from("research_item_cache")
    .select("result, expires_at")
    .eq("kind", kind)
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data.result as T;
}

async function saveItemCache(
  supabase: SupabaseClient,
  payload: {
    kind: "candidate" | "measure";
    cacheKey: string;
    title: string;
    result: CandidateResult | MeasureResult;
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + ITEM_CACHE_TTL_MS).toISOString();
  const { error } = await supabase.from("research_item_cache").upsert(
    {
      kind: payload.kind,
      cache_key: payload.cacheKey,
      title: payload.title,
      result: payload.result,
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: "kind,cache_key" }
  );

  if (error) {
    throw new Error(`Failed to persist research item cache: ${error.message}`);
  }
}

export function loadCandidatePersonalizationCache(
  supabase: SupabaseClient,
  cacheKey: string
) {
  return loadItemCache<CandidateResult>(supabase, "candidate", cacheKey);
}

export function loadMeasurePersonalizationCache(
  supabase: SupabaseClient,
  cacheKey: string
) {
  return loadItemCache<MeasureResult>(supabase, "measure", cacheKey);
}

export function saveCandidatePersonalizationCache(
  supabase: SupabaseClient,
  cacheKey: string,
  title: string,
  result: CandidateResult
) {
  return saveItemCache(supabase, {
    kind: "candidate",
    cacheKey,
    title,
    result,
  });
}

export function saveMeasurePersonalizationCache(
  supabase: SupabaseClient,
  cacheKey: string,
  title: string,
  result: MeasureResult
) {
  return saveItemCache(supabase, {
    kind: "measure",
    cacheKey,
    title,
    result,
  });
}
