import { NextRequest, NextResponse } from "next/server";
import { getUserTierForEmail } from "@/lib/account";
import { canAccessFeature } from "@/lib/freemium";
import { createClient } from "@/lib/supabase/server";
import type {
  ValuesProfile,
  BallotInput,
  RaceRecommendation,
  MeasureResult,
} from "@/lib/types";
import {
  isValidBallotInput,
  isValidMeasureResult,
  isValidRaceRecommendation,
  isValidValuesProfile,
} from "@/lib/validation";
import {
  sanitizeMeasureResult,
  sanitizeRaceRecommendation,
} from "@/lib/research-text";

interface SaveGuideBody {
  valuesProfile: ValuesProfile;
  ballotInput: BallotInput;
  recommendations: RaceRecommendation[];
  measureResults?: MeasureResult[];
  isPublic: boolean;
}

function isValidSaveGuideBody(body: unknown): body is SaveGuideBody {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;

  return (
    isValidValuesProfile(candidate.valuesProfile) &&
    isValidBallotInput(candidate.ballotInput) &&
    Array.isArray(candidate.recommendations) &&
    candidate.recommendations.every(isValidRaceRecommendation) &&
    (candidate.measureResults === undefined ||
      (Array.isArray(candidate.measureResults) &&
        candidate.measureResults.every(isValidMeasureResult))) &&
    typeof candidate.isPublic === "boolean"
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  if (!canAccessFeature(getUserTierForEmail(user.email), "share")) {
    return NextResponse.json(
      { error: "Save and share is available on Pro." },
      { status: 403 }
    );
  }

  let body: SaveGuideBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidSaveGuideBody(body)) {
    return NextResponse.json(
      { error: "Invalid guide payload" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("voter_guides")
    .insert({
      user_id: user.id,
      values_profile: body.valuesProfile,
      ballot_input: body.ballotInput,
      recommendations: body.recommendations.map(sanitizeRaceRecommendation),
      measure_results: body.measureResults?.map(sanitizeMeasureResult) ?? null,
      is_public: body.isPublic,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 }
    );
  }

  const guideId = request.nextUrl.searchParams.get("id");

  if (guideId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Fetch a specific guide. Public responses are intentionally sanitized
    // so shared links do not leak stored profile details or street addresses.
    const { data, error } = await supabase
      .from("voter_guides")
      .select(
        "id, user_id, created_at, is_public, recommendations, measure_results, ballot_input"
      )
      .eq("id", guideId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Guide not found" },
        { status: 404 }
      );
    }

    const ballotInput =
      data.ballot_input &&
      typeof data.ballot_input === "object" &&
      !Array.isArray(data.ballot_input) &&
      "state" in data.ballot_input &&
      typeof data.ballot_input.state === "string"
        ? { state: data.ballot_input.state }
        : { state: "" };

    const isOwner = user?.id === data.user_id;

    return NextResponse.json({
      id: data.id,
      created_at: data.created_at,
      is_public: data.is_public,
      ballot_input: ballotInput,
      recommendations: Array.isArray(data.recommendations)
        ? data.recommendations.map(sanitizeRaceRecommendation)
        : [],
      measure_results: Array.isArray(data.measure_results)
        ? data.measure_results.map(sanitizeMeasureResult)
        : data.measure_results,
      ...(isOwner ? { can_edit: true } : {}),
    });
  }

  // List own guides
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("voter_guides")
    .select("id, created_at, ballot_input, is_public")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
