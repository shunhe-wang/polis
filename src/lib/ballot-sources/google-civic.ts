import type {
  BallotElectionContext,
  BallotMeasure,
  Race,
} from "@/lib/types";

const CIVIC_FETCH_TIMEOUT_MS = 15_000;

export interface CivicCandidate {
  name: string;
  party?: string;
}

export interface CivicContest {
  type: string;
  office?: string;
  ballotTitle?: string;
  referendumTitle?: string;
  referendumText?: string;
  level?: string[];
  candidates?: CivicCandidate[];
}

export interface CivicElection {
  id: string;
  name: string;
  electionDay: string;
}

export interface CivicResponse {
  election?: CivicElection;
  otherElections?: CivicElection[];
  normalizedInput?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  contests?: CivicContest[];
  error?: { message: string };
}

interface ElectionsResponse {
  elections?: CivicElection[];
}

export interface CivicLookupResult {
  state: string | null;
  election: BallotElectionContext | null;
  availableElections: BallotElectionContext[];
  requiresElectionSelection: boolean;
  primaryParties: string[];
  races: Race[];
  measures: BallotMeasure[];
  error: string | null;
  resolvedAddress: string;
  locality: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CIVIC_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  const data = (await response.json()) as T;

  if (
    !response.ok &&
    (!data ||
      typeof data !== "object" ||
      !("error" in (data as Record<string, unknown>)))
  ) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }

  return data;
}

export function mapLevel(levels: string[] | undefined): Race["level"] {
  if (!levels || levels.length === 0) return "local";
  const level = levels[0];
  if (level.includes("country")) return "federal";
  if (level.includes("administrativeArea1")) return "state";
  return "local";
}

function nextCandidateId(): string {
  return crypto.randomUUID();
}

function nextRaceId(): string {
  return crypto.randomUUID();
}

function nextMeasureId(): string {
  return crypto.randomUUID();
}

export function isMeasureContest(contest: CivicContest): boolean {
  const type = contest.type.toLowerCase();

  return (
    type === "ballot-measure" ||
    type.includes("referendum") ||
    Boolean(contest.referendumTitle || contest.referendumText)
  );
}

export function isRaceContest(contest: CivicContest): boolean {
  return !isMeasureContest(contest) &&
    (Boolean(contest.office) || (contest.candidates?.length ?? 0) > 0);
}

export function inferMeasureType(
  contest: CivicContest
): BallotMeasure["type"] {
  const text = (
    (contest.referendumTitle ?? "") +
    " " +
    (contest.ballotTitle ?? "")
  ).toLowerCase();
  if (text.includes("amendment")) return "amendment";
  if (text.includes("initiative")) return "initiative";
  if (text.includes("referendum")) return "referendum";
  return "other";
}

function inferElectionKind(name: string): BallotElectionContext["kind"] {
  const lower = name.toLowerCase();
  if (lower.includes("primary")) return "primary";
  if (lower.includes("general")) return "general";
  if (lower.includes("special")) return "special";
  return "other";
}

function toElectionContext(
  election: CivicElection | null | undefined
): BallotElectionContext | null {
  if (!election) return null;

  return {
    id: election.id,
    name: election.name,
    electionDay: election.electionDay,
    kind: inferElectionKind(election.name),
    selectedParty: null,
  };
}

function dedupeElections(
  elections: Array<CivicElection | null | undefined>
): BallotElectionContext[] {
  const seen = new Set<string>();
  const contexts: BallotElectionContext[] = [];

  for (const election of elections) {
    const context = toElectionContext(election);
    if (!context || seen.has(context.id)) continue;
    seen.add(context.id);
    contexts.push(context);
  }

  return contexts;
}

function extractPrimaryParties(races: Race[]): string[] {
  const parties = new Set<string>();

  for (const race of races) {
    if (!race.contestType?.toLowerCase().includes("primary")) continue;
    for (const candidate of race.candidates) {
      if (candidate.party) {
        parties.add(candidate.party);
      }
    }
  }

  return Array.from(parties).sort((a, b) => a.localeCompare(b));
}

async function findMatchingElections(
  resolvedAddress: string,
  apiKey: string,
  elections: CivicElection[]
): Promise<Array<{ election: CivicElection; data: CivicResponse }>> {
  const matches: Array<{ election: CivicElection; data: CivicResponse }> = [];

  for (const election of elections) {
    const elUrl = new URL(
      "https://www.googleapis.com/civicinfo/v2/voterinfo"
    );
    elUrl.searchParams.set("key", apiKey);
    elUrl.searchParams.set("address", resolvedAddress);
    elUrl.searchParams.set("electionId", election.id);

    const elData = await fetchJson<CivicResponse>(elUrl.toString());

    if (!elData.error && (elData.contests?.length ?? 0) > 0) {
      matches.push({ election, data: elData });
    }
  }

  return matches;
}

function getLocality(data: CivicResponse) {
  return data.normalizedInput
    ? {
        line1: data.normalizedInput.line1 ?? null,
        city: data.normalizedInput.city ?? null,
        state: data.normalizedInput.state ?? null,
        zip: data.normalizedInput.zip ?? null,
      }
    : null;
}

export function buildResult(data: CivicResponse, resolvedAddress = ""): CivicLookupResult {
  return buildResultWithElection(data, data.election, resolvedAddress);
}

export function buildResultWithElection(
  data: CivicResponse,
  electionOverride?: CivicElection | null,
  resolvedAddress = ""
): CivicLookupResult {
  const state = data.normalizedInput?.state ?? null;
  const election = toElectionContext(electionOverride ?? data.election);

  const races: Race[] = (data.contests ?? [])
    .filter(isRaceContest)
    .map((contest) => ({
      id: nextRaceId(),
      name: contest.office ?? contest.ballotTitle ?? "Unknown Race",
      level: mapLevel(contest.level),
      contestType: contest.type,
      candidates: (contest.candidates ?? []).map((c) => ({
        id: nextCandidateId(),
        name: c.name,
        party: c.party ?? null,
      })),
    }));

  const measures: BallotMeasure[] = (data.contests ?? [])
    .filter(isMeasureContest)
    .map((contest) => ({
      id: nextMeasureId(),
      title: contest.referendumTitle ?? contest.ballotTitle ?? "Ballot Measure",
      description: contest.referendumText ?? "",
      type: inferMeasureType(contest),
    }));

  return {
    state,
    election,
    availableElections: election ? [election] : [],
    requiresElectionSelection: false,
    primaryParties: extractPrimaryParties(races),
    races,
    measures,
    error: null,
    resolvedAddress,
    locality: getLocality(data),
  };
}

export async function lookupGoogleCivicBallot(input: {
  address: string;
  electionId?: string | null;
}): Promise<CivicLookupResult> {
  const address = input.address;
  const electionId = input.electionId ?? null;
  const apiKey = process.env.GOOGLE_CIVIC_API_KEY;

  if (!apiKey) {
    throw new Error("Google Civic API key is not configured");
  }

  const zipPattern = /^\d{5}(-\d{4})?$/;
  let resolvedAddress = address;

  if (zipPattern.test(address.trim())) {
    const geocodeUrl = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );
    geocodeUrl.searchParams.set("address", address.trim());
    geocodeUrl.searchParams.set("key", apiKey);

    const geocodeData = await fetchJson<{
      results?: Array<{ formatted_address?: string }>;
    }>(geocodeUrl.toString());

    if (geocodeData.results && geocodeData.results.length > 0) {
      resolvedAddress = geocodeData.results[0].formatted_address ?? address;
    }
  }

  if (electionId) {
    const selectedUrl = new URL(
      "https://www.googleapis.com/civicinfo/v2/voterinfo"
    );
    selectedUrl.searchParams.set("key", apiKey);
    selectedUrl.searchParams.set("address", resolvedAddress);
    selectedUrl.searchParams.set("electionId", electionId);

    const selectedData = await fetchJson<CivicResponse>(selectedUrl.toString());
    if (!selectedData.error && (selectedData.contests?.length ?? 0) > 0) {
      return buildResult(selectedData, resolvedAddress);
    }
  }

  const url = new URL("https://www.googleapis.com/civicinfo/v2/voterinfo");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("address", resolvedAddress);

  const data = await fetchJson<CivicResponse>(url.toString());

  if (!data.error) {
    const availableElections = dedupeElections([
      data.election,
      ...(data.otherElections ?? []),
    ]);

    if (availableElections.length > 1) {
      return {
        state: data.normalizedInput?.state ?? null,
        election: null,
        availableElections,
        requiresElectionSelection: true,
        primaryParties: [],
        races: [],
        measures: [],
        error: null,
        resolvedAddress,
        locality: getLocality(data),
      };
    }

    return buildResult(data, resolvedAddress);
  }

  if (data.error.message === "Election unknown") {
    const electionsUrl = new URL(
      "https://www.googleapis.com/civicinfo/v2/elections"
    );
    electionsUrl.searchParams.set("key", apiKey);
    const electionsData = await fetchJson<ElectionsResponse>(
      electionsUrl.toString()
    );

    const elections = (electionsData.elections ?? []).filter(
      (e) => e.id !== "2000"
    );

    const matches = await findMatchingElections(
      resolvedAddress,
      apiKey,
      elections
    );

    if (matches.length > 1) {
      return {
        state: data.normalizedInput?.state ?? null,
        election: null,
        availableElections: matches
          .map((match) => toElectionContext(match.election))
          .filter((value): value is BallotElectionContext => value !== null),
        requiresElectionSelection: true,
        primaryParties: [],
        races: [],
        measures: [],
        error: null,
        resolvedAddress,
        locality: getLocality(data),
      };
    }

    if (matches.length === 1) {
      return buildResultWithElection(
        matches[0].data,
        matches[0].election,
        resolvedAddress
      );
    }
  }

  return {
    error:
      "No upcoming elections found for this address right now. You can add races and candidates manually below, or check back later as election data becomes available.",
    state: null,
    election: null,
    availableElections: [],
    requiresElectionSelection: false,
    primaryParties: [],
    races: [],
    measures: [],
    resolvedAddress,
    locality: null,
  };
}
