import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BallotMeasure,
  Candidate,
  CandidateDossier,
  MeasureDossier,
  Race,
} from "@/lib/types";

const DOSSIER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export function buildCandidateDossierKey(
  candidate: Candidate,
  race: Race,
  state: string
): string {
  return hashKey([
    "candidate_dossier_v1",
    normalizeKeyPart(state),
    normalizeKeyPart(race.name),
    normalizeKeyPart(candidate.name),
    normalizeKeyPart(candidate.party ?? ""),
  ]);
}

export function buildMeasureDossierKey(
  measure: BallotMeasure,
  state: string
): string {
  return hashKey([
    "measure_dossier_v1",
    normalizeKeyPart(state),
    normalizeKeyPart(measure.title),
    normalizeKeyPart(measure.description),
  ]);
}

async function loadDossier<T>(
  supabase: SupabaseClient,
  kind: "candidate" | "measure",
  cacheKey: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from("research_dossiers")
    .select("dossier, expires_at")
    .eq("kind", kind)
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return data.dossier as T;
}

async function saveDossier(
  supabase: SupabaseClient,
  payload: {
    kind: "candidate" | "measure";
    cacheKey: string;
    title: string;
    state: string;
    dossier: CandidateDossier | MeasureDossier;
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + DOSSIER_TTL_MS).toISOString();
  const { error } = await supabase.from("research_dossiers").upsert(
    {
      kind: payload.kind,
      cache_key: payload.cacheKey,
      title: payload.title,
      state: payload.state,
      dossier: payload.dossier,
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: "kind,cache_key" }
  );

  if (error) {
    throw new Error(`Failed to persist dossier: ${error.message}`);
  }
}

export function loadCandidateDossier(
  supabase: SupabaseClient,
  cacheKey: string
) {
  return loadDossier<CandidateDossier>(supabase, "candidate", cacheKey);
}

export function loadMeasureDossier(
  supabase: SupabaseClient,
  cacheKey: string
) {
  return loadDossier<MeasureDossier>(supabase, "measure", cacheKey);
}

export function saveCandidateDossier(
  supabase: SupabaseClient,
  cacheKey: string,
  title: string,
  state: string,
  dossier: CandidateDossier
) {
  return saveDossier(supabase, {
    kind: "candidate",
    cacheKey,
    title,
    state,
    dossier,
  });
}

export function saveMeasureDossier(
  supabase: SupabaseClient,
  cacheKey: string,
  title: string,
  state: string,
  dossier: MeasureDossier
) {
  return saveDossier(supabase, {
    kind: "measure",
    cacheKey,
    title,
    state,
    dossier,
  });
}
