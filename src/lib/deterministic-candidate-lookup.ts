import type { Race } from "@/lib/types";

export type DeterministicOfficeRace =
  | "us_senate"
  | "us_house"
  | "governor"
  | "attorney_general"
  | "secretary_of_state"
  | "state_senate"
  | "state_house"
  | "mayor"
  | "city_council"
  | "school_board";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/u\.?s\.?/g, "us")
    .replace(/united states/g, "us")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRaceKey(name: string): string {
  return normalizeText(name.split(" - ")[0] ?? name);
}

function extractQualifier(name: string): string | null {
  const parts = name.split(" - ");
  if (parts.length < 2) return null;

  return normalizeText(parts.slice(1).join(" "));
}

export function classifyDeterministicOfficeRace(
  raceName: string,
  level?: Race["level"]
): DeterministicOfficeRace | null {
  const normalized = normalizeRaceKey(raceName);

  if (
    normalized.includes("us senate") ||
    normalized.includes("us senator")
  ) {
    return "us_senate";
  }

  if (
    (level === "federal" || normalized.includes("us house")) &&
    (normalized.includes("representative") ||
      normalized.includes("house"))
  ) {
    return "us_house";
  }

  if (normalized.includes("attorney general")) {
    return "attorney_general";
  }

  if (normalized.includes("secretary of state")) {
    return "secretary_of_state";
  }

  if (/\bgovernor\b/.test(normalized) && !normalized.includes("lieutenant")) {
    return "governor";
  }

  if (
    level === "state" &&
    (normalized.includes("state senate") ||
      normalized.includes("state senator") ||
      /\bsenate\b/.test(normalized))
  ) {
    return "state_senate";
  }

  if (
    level === "state" &&
    (normalized.includes("state house") ||
      normalized.includes("house of delegates") ||
      normalized.includes("general assembly") ||
      normalized.includes("assembly") ||
      normalized.includes("delegate") ||
      /\bhouse\b/.test(normalized))
  ) {
    return "state_house";
  }

  if (normalized.includes("mayor")) {
    return "mayor";
  }

  if (normalized.includes("city council") || normalized.includes("town council")) {
    return "city_council";
  }

  if (
    normalized.includes("school board") ||
    normalized.includes("board of education")
  ) {
    return "school_board";
  }

  return null;
}

export function isDeterministicOfficeLookup(raceName: string): boolean {
  return classifyDeterministicOfficeRace(raceName) !== null;
}

function dedupeCandidates(candidates: Race["candidates"]): Race["candidates"] {
  const deduped = new Map<string, Race["candidates"][number]>();
  for (const candidate of candidates) {
    const key = `${candidate.name.toLowerCase()}::${candidate.party ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }
  return Array.from(deduped.values());
}

function findByExactRaceName(
  races: Race[],
  requestedRaceName: string
): Race["candidates"] | null {
  const requestedKey = normalizeRaceKey(requestedRaceName);
  const matches = races.filter(
    (race) =>
      race.candidates.length > 0 &&
      normalizeRaceKey(race.name) === requestedKey
  );

  if (matches.length !== 1) {
    return null;
  }

  return dedupeCandidates(matches[0].candidates);
}

function findByOfficeClassification(
  races: Race[],
  requestedRaceName: string
): Race["candidates"] | null {
  const requestedType = classifyDeterministicOfficeRace(requestedRaceName);
  if (!requestedType) return null;

  const matches = races.filter(
    (race) =>
      classifyDeterministicOfficeRace(race.name, race.level) === requestedType &&
      race.candidates.length > 0
  );

  if (matches.length === 1) {
    return dedupeCandidates(matches[0].candidates);
  }

  const qualifier = extractQualifier(requestedRaceName);
  if (!qualifier) {
    return null;
  }

  const qualifiedMatches = matches.filter((race) =>
    normalizeText(race.name).includes(qualifier)
  );

  if (qualifiedMatches.length !== 1) {
    return null;
  }

  return dedupeCandidates(qualifiedMatches[0].candidates);
}

export function findDeterministicCandidates(
  races: Race[],
  requestedRaceName: string
): Race["candidates"] | null {
  return (
    findByExactRaceName(races, requestedRaceName) ??
    findByOfficeClassification(races, requestedRaceName)
  );
}
