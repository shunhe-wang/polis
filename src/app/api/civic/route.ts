import { NextRequest, NextResponse } from "next/server";
import type { Race, BallotMeasure } from "@/lib/types";

interface CivicCandidate {
  name: string;
  party?: string;
}

interface CivicContest {
  type: string;
  office?: string;
  ballotTitle?: string;
  referendumTitle?: string;
  referendumText?: string;
  level?: string[];
  candidates?: CivicCandidate[];
}

interface CivicResponse {
  normalizedInput?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  contests?: CivicContest[];
  error?: { message: string };
}

function mapLevel(levels: string[] | undefined): Race["level"] {
  if (!levels || levels.length === 0) return "local";
  const level = levels[0];
  if (level.includes("country")) return "federal";
  if (level.includes("administrativeArea1")) return "state";
  return "local";
}

let candidateIdCounter = 0;
function nextCandidateId(): string {
  candidateIdCounter++;
  return `candidate-${candidateIdCounter}`;
}

let raceIdCounter = 0;
function nextRaceId(): string {
  raceIdCounter++;
  return `race-${raceIdCounter}`;
}

interface ElectionsResponse {
  elections?: Array<{ id: string; name: string; electionDay: string }>;
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address || address.trim().length === 0) {
    return NextResponse.json(
      { error: "Address is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_CIVIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Civic API key is not configured" },
      { status: 500 }
    );
  }

  try {
    // If the input looks like a bare zip code, geocode it to a full address first
    const zipPattern = /^\d{5}(-\d{4})?$/;
    let resolvedAddress = address;

    if (zipPattern.test(address.trim())) {
      const geocodeUrl = new URL(
        "https://maps.googleapis.com/maps/api/geocode/json"
      );
      geocodeUrl.searchParams.set("address", address.trim());
      geocodeUrl.searchParams.set("key", apiKey);

      const geocodeRes = await fetch(geocodeUrl.toString());
      const geocodeData = (await geocodeRes.json()) as {
        results?: Array<{ formatted_address?: string }>;
      };

      if (geocodeData.results && geocodeData.results.length > 0) {
        resolvedAddress =
          geocodeData.results[0].formatted_address ?? address;
      }
    }

    // First try without electionId (works when there's an obvious upcoming election)
    const url = new URL(
      "https://www.googleapis.com/civicinfo/v2/voterinfo"
    );
    url.searchParams.set("key", apiKey);
    url.searchParams.set("address", resolvedAddress);

    const response = await fetch(url.toString());
    const data: CivicResponse = await response.json();

    if (!data.error) {
      return NextResponse.json(buildResult(data));
    }

    // If "Election unknown", fetch available elections and try each
    if (data.error.message === "Election unknown") {
      const electionsUrl = new URL(
        "https://www.googleapis.com/civicinfo/v2/elections"
      );
      electionsUrl.searchParams.set("key", apiKey);
      const electionsRes = await fetch(electionsUrl.toString());
      const electionsData: ElectionsResponse = await electionsRes.json();

      const elections = (electionsData.elections ?? []).filter(
        (e) => e.id !== "2000" // Skip the VIP test election
      );

      for (const election of elections) {
        const elUrl = new URL(
          "https://www.googleapis.com/civicinfo/v2/voterinfo"
        );
        elUrl.searchParams.set("key", apiKey);
        elUrl.searchParams.set("address", resolvedAddress);
        elUrl.searchParams.set("electionId", election.id);

        const elRes = await fetch(elUrl.toString());
        const elData: CivicResponse = await elRes.json();

        if (!elData.error && elData.contests && elData.contests.length > 0) {
          return NextResponse.json(buildResult(elData));
        }
      }
    }

    // No elections found for this address
    return NextResponse.json({
      error:
        "No upcoming elections found for this address. You can add races and candidates manually below.",
      state: null,
      races: [],
      measures: [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch civic data";
    return NextResponse.json(
      { error: message, state: null, races: [], measures: [] },
      { status: 200 }
    );
  }
}

let measureIdCounter = 0;
function nextMeasureId(): string {
  measureIdCounter++;
  return `measure-${measureIdCounter}`;
}

function inferMeasureType(
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

function buildResult(data: CivicResponse): {
  state: string | null;
  races: Race[];
  measures: BallotMeasure[];
  error: string | null;
} {
  const state = data.normalizedInput?.state ?? null;

  const races: Race[] = (data.contests ?? [])
    .filter((contest) => contest.type === "General")
    .map((contest) => ({
      id: nextRaceId(),
      name: contest.office ?? contest.ballotTitle ?? "Unknown Race",
      level: mapLevel(contest.level),
      candidates: (contest.candidates ?? []).map((c) => ({
        id: nextCandidateId(),
        name: c.name,
        party: c.party ?? null,
      })),
    }));

  const measures: BallotMeasure[] = (data.contests ?? [])
    .filter((contest) => contest.type === "ballot-measure")
    .map((contest) => ({
      id: nextMeasureId(),
      title: contest.referendumTitle ?? contest.ballotTitle ?? "Ballot Measure",
      description: contest.referendumText ?? "",
      type: inferMeasureType(contest),
    }));

  return { state, races, measures, error: null };
}
