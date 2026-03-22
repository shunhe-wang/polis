import type { Race } from "@/lib/types";

export type DeterministicStatewideRace =
  | "us_senate"
  | "governor"
  | "attorney_general"
  | "secretary_of_state";

function normalizeRaceName(name: string): string {
  return name
    .split(" - ")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function classifyDeterministicStatewideRace(
  raceName: string
): DeterministicStatewideRace | null {
  const normalized = normalizeRaceName(raceName);

  if (
    normalized.includes("us senate") ||
    normalized.includes("u s senate") ||
    normalized.includes("united states senate") ||
    normalized.includes("united states senator")
  ) {
    return "us_senate";
  }

  if (normalized.includes("attorney general")) {
    return "attorney_general";
  }

  if (normalized.includes("secretary of state")) {
    return "secretary_of_state";
  }

  if (
    /\bgovernor\b/.test(normalized) &&
    !normalized.includes("lieutenant governor")
  ) {
    return "governor";
  }

  return null;
}

export function findDeterministicStatewideCandidates(
  races: Race[],
  requestedRaceName: string
): Race["candidates"] | null {
  const requestedType = classifyDeterministicStatewideRace(requestedRaceName);
  if (!requestedType) return null;

  const matches = races.filter(
    (race) =>
      classifyDeterministicStatewideRace(race.name) === requestedType &&
      race.candidates.length > 0
  );

  // Two statewide contests of the same office on one ballot is possible in rare
  // special-election cases. Do not guess; fall back to the slower path instead.
  if (matches.length !== 1) {
    return null;
  }

  const deduped = new Map<string, Race["candidates"][number]>();
  for (const candidate of matches[0].candidates) {
    const key = `${candidate.name.toLowerCase()}::${candidate.party ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return Array.from(deduped.values());
}
