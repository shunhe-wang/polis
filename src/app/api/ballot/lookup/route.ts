import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupGoogleCivicBallot } from "@/lib/ballot-sources/google-civic";
import { resolveOfficialFallbackLinks } from "@/lib/official-fallbacks";
import { persistBallotImport } from "@/lib/ballot-imports";
import { buildBallotFallbackLinks } from "@/lib/ballot-fallbacks";
import type { BallotImportMeta, BallotInput } from "@/lib/types";

interface BallotLookupResponse {
  state: string | null;
  election: BallotInput["election"];
  availableElections: NonNullable<BallotInput["election"]>[];
  requiresElectionSelection: boolean;
  primaryParties: string[];
  races: BallotInput["races"];
  measures: BallotInput["measures"];
  importMeta: BallotImportMeta;
  error: string | null;
}

function buildImportMeta(input: {
  status: BallotImportMeta["status"];
  confidence: number;
  message: string | null;
  fallbackLinks: BallotImportMeta["fallbackLinks"];
  locality: BallotImportMeta["locality"];
}): BallotImportMeta {
  return {
    importId: null,
    source: "google_civic",
    status: input.status,
    confidence: input.confidence,
    message: input.message,
    fallbackLinks: input.fallbackLinks,
    locality: input.locality,
  };
}

function inferImportStatus(input: {
  raceCount: number;
  measureCount: number;
  requiresElectionSelection: boolean;
}): Pick<BallotImportMeta, "status" | "confidence" | "message"> {
  if (input.requiresElectionSelection) {
    return {
      status: "partial",
      confidence: 65,
      message: "We found multiple elections for this address. Choose one before we load the ballot.",
    };
  }

  if (input.raceCount === 0 && input.measureCount === 0) {
    return {
      status: "unavailable",
      confidence: 20,
      message:
        "Google Civic did not return a ballot for this address yet. Check an official election source, add races manually, or come back later as election data becomes available.",
    };
  }

  if (input.measureCount === 0) {
    return {
      status: "partial",
      confidence: 70,
      message:
        "We found part of your ballot, but local measures or precinct-specific contests may still be missing.",
    };
  }

  return {
    status: "complete",
    confidence: 90,
    message:
      "We imported a ballot from Google Civic. Review it against an official sample ballot before running research.",
  };
}

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
    const [supabase, admin] = await Promise.all([
      createClient(),
      Promise.resolve(createAdminClient()),
    ]);

    const {
      data: { user },
    } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null } };

    const civic = await lookupGoogleCivicBallot({ address, electionId });
    const status = inferImportStatus({
      raceCount: civic.races.length,
      measureCount: civic.measures.length,
      requiresElectionSelection: civic.requiresElectionSelection,
    });

    const fallbackLinks = await resolveOfficialFallbackLinks(admin, {
      address: civic.resolvedAddress || address,
      state: civic.locality?.state ?? civic.state,
      city: civic.locality?.city ?? null,
      election: civic.election,
    });

    const importMeta = buildImportMeta({
      status: status.status,
      confidence: status.confidence,
      message: status.message,
      fallbackLinks,
      locality: civic.locality
        ? {
            city: civic.locality.city,
            county: null,
            state: civic.locality.state,
            zip: civic.locality.zip,
          }
        : null,
    });

    if (
      admin &&
      user &&
      !civic.requiresElectionSelection &&
      (civic.races.length > 0 || civic.measures.length > 0)
    ) {
      const importId = await persistBallotImport(
        admin,
        {
          address: civic.resolvedAddress || address,
          state: civic.state ?? "",
          election: civic.election,
          importMeta,
          races: civic.races,
          measures: civic.measures,
        },
        importMeta,
        user
      );
      if (importId) {
        importMeta.importId = importId;
      }
    }

    return NextResponse.json({
      state: civic.state,
      election: civic.election,
      availableElections: civic.availableElections,
      requiresElectionSelection: civic.requiresElectionSelection,
      primaryParties: civic.primaryParties,
      races: civic.races,
      measures: civic.measures,
      importMeta,
      error: civic.error,
    } satisfies BallotLookupResponse);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Ballot lookup timed out. Please try again."
        : err instanceof Error
          ? err.message
          : "Failed to look up this ballot";

    return NextResponse.json(
      {
        state: null,
        election: null,
        availableElections: [],
        requiresElectionSelection: false,
        primaryParties: [],
        races: [],
        measures: [],
        importMeta: {
          importId: null,
          source: "google_civic",
          status: "unavailable",
          confidence: 0,
          message,
          fallbackLinks: buildBallotFallbackLinks({
            address,
            state: null,
            election: null,
          }),
          locality: null,
        },
        error: message,
      } satisfies BallotLookupResponse,
      {
        status:
          err instanceof Error && err.name === "AbortError" ? 504 : 502,
      }
    );
  }
}
