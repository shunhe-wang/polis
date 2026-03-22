import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserTierForEmail } from "@/lib/account";
import {
  enforceStarterAnalysisQuota,
  getStarterAnalysisLimit,
  getStarterAnalysisRemaining,
} from "@/lib/ai-quotas";
import { runStarterCandidateAnalysis } from "@/lib/anthropic";
import { canAccessFeature } from "@/lib/freemium";
import { sanitizeCandidateResult } from "@/lib/research-text";
import {
  isValidCandidate,
  isValidCandidateResult,
  isValidRace,
  isValidValuesProfile,
} from "@/lib/validation";
import type { Candidate, Race, ValuesProfile } from "@/lib/types";

interface StarterAnalysisBody {
  valuesProfile: ValuesProfile;
  candidate: Candidate;
  race: Race;
  state: string;
}

function isValidStarterAnalysisBody(
  body: unknown
): body is StarterAnalysisBody {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  const candidate = value.candidate;
  const race = value.race;

  if (
    !isValidValuesProfile(value.valuesProfile) ||
    !isValidCandidate(candidate) ||
    !isValidRace(race) ||
    typeof value.state !== "string" ||
    value.state.length > 100
  ) {
    return false;
  }

  return race.candidates.some(
    (raceCandidate) => raceCandidate.id === candidate.id
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Create a free account to unlock your starter candidate analysis.",
      },
      { status: 401 }
    );
  }

  const tier = getUserTierForEmail(user.email);
  if (!canAccessFeature(tier, "starter_analysis")) {
    return NextResponse.json(
      { error: "Starter analysis is not available for this account." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidStarterAnalysisBody(body)) {
    return NextResponse.json(
      { error: "Invalid starter analysis payload" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured" },
      { status: 500 }
    );
  }

  if (tier === "free") {
    try {
      const quotaFailure = await enforceStarterAnalysisQuota(supabase);
      if (quotaFailure) {
        return NextResponse.json(
          {
            error:
              "Your free starter analysis has already been used. Upgrade to unlock full-ballot research.",
            starterAnalysesRemaining: 0,
          },
          { status: 403 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to enforce starter analysis quota",
        },
        { status: 503 }
      );
    }
  }

  try {
    const result = await runStarterCandidateAnalysis({
      candidate: body.candidate,
      race: body.race,
      state: body.state,
      profile: body.valuesProfile,
    });

    const sanitizedResult = sanitizeCandidateResult({
      ...result,
      candidateId: body.candidate.id,
    });

    if (!isValidCandidateResult(sanitizedResult)) {
      return NextResponse.json(
        { error: "Starter analysis returned an invalid result" },
        { status: 502 }
      );
    }

    const starterAnalysesRemaining =
      tier === "free"
        ? await getStarterAnalysisRemaining(supabase)
        : getStarterAnalysisLimit();

    return NextResponse.json({
      result: sanitizedResult,
      starterAnalysesRemaining,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Starter analysis failed",
      },
      { status: 502 }
    );
  }
}
