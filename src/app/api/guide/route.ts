import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  ValuesProfile,
  BallotInput,
  RaceRecommendation,
  MeasureResult,
} from "@/lib/types";

interface SaveGuideBody {
  valuesProfile: ValuesProfile;
  ballotInput: BallotInput;
  recommendations: RaceRecommendation[];
  measureResults?: MeasureResult[];
  isPublic: boolean;
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

  let body: SaveGuideBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("voter_guides")
    .insert({
      user_id: user.id,
      values_profile: body.valuesProfile,
      ballot_input: body.ballotInput,
      recommendations: body.recommendations,
      measure_results: body.measureResults ?? null,
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
    // Fetch a specific guide (public or own)
    const { data, error } = await supabase
      .from("voter_guides")
      .select("*")
      .eq("id", guideId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Guide not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
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
