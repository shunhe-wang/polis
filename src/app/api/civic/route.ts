import { NextRequest, NextResponse } from "next/server";
import {
  buildResult,
  buildResultWithElection,
  inferMeasureType,
  isMeasureContest,
  isRaceContest,
  lookupGoogleCivicBallot,
  mapLevel,
} from "@/lib/ballot-sources/google-civic";

export {
  buildResult,
  buildResultWithElection,
  inferMeasureType,
  isMeasureContest,
  isRaceContest,
  mapLevel,
};

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const electionId = request.nextUrl.searchParams.get("electionId");

  if (!address || address.trim().length === 0) {
    return NextResponse.json(
      { error: "Address is required" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await lookupGoogleCivicBallot({
        address,
        electionId,
      })
    );
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Ballot lookup timed out. Google Civic took too long to respond."
        : err instanceof Error
          ? err.message
          : "Failed to fetch civic data";
    return NextResponse.json(
      {
        error: message,
        state: null,
        election: null,
        availableElections: [],
        requiresElectionSelection: false,
        primaryParties: [],
        races: [],
        measures: [],
        resolvedAddress: address,
        locality: null,
      },
      {
        status:
          err instanceof Error && err.name === "AbortError" ? 504 : 502,
      }
    );
  }
}
