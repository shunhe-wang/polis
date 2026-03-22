import { createClient } from "@/lib/supabase/client";
import {
  createEmptyValuesProfile,
  hydrateValuesProfile,
  type ValuesProfile,
  type BallotInput,
} from "@/lib/types";

// ─── Values Profile ───────────────────────────────────────────────

export async function saveValuesProfile(
  profile: ValuesProfile
): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("values_profiles").upsert(
    {
      user_id: user.id,
      issue_ratings: profile.issueRatings,
      policy_signals: profile.policySignals,
      free_text: profile.freeText,
      political_identity: profile.politicalIdentity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return !error;
}

export async function loadValuesProfile(): Promise<ValuesProfile | null> {
  const supabase = createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("values_profiles")
    .select("issue_ratings, policy_signals, free_text, political_identity")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;

  return hydrateValuesProfile({
    issueRatings: data.issue_ratings,
    policySignals: data.policy_signals ?? createEmptyValuesProfile().policySignals,
    freeText: data.free_text,
    politicalIdentity: data.political_identity,
  });
}

// ─── Ballot Input ─────────────────────────────────────────────────

export async function saveBallotInput(
  ballot: BallotInput
): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("saved_ballots").upsert(
    {
      user_id: user.id,
      ballot_input: ballot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (!error) {
    sessionStorage.setItem("ballotInput", JSON.stringify(ballot));
  }

  return !error;
}

export async function loadBallotInput(): Promise<BallotInput | null> {
  const supabase = createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("saved_ballots")
    .select("ballot_input")
    .eq("user_id", user.id)
    .single();

  if (error || !data?.ballot_input) return null;

  return data.ballot_input as BallotInput;
}

// ─── Sync helper ──────────────────────────────────────────────────

/**
 * On app load, if the user is logged in, try to load their saved
 * profile from Supabase and populate sessionStorage if it's empty.
 */
export async function syncFromSupabase(): Promise<{
  profile: ValuesProfile | null;
  ballot: BallotInput | null;
}> {
  const [profile, ballot] = await Promise.all([
    loadValuesProfile(),
    loadBallotInput(),
  ]);

  if (profile) {
    const existing = sessionStorage.getItem("valuesProfile");
    if (!existing) {
      sessionStorage.setItem("valuesProfile", JSON.stringify(profile));
    }
  }

  if (ballot) {
    const existing = sessionStorage.getItem("ballotInput");
    if (!existing) {
      sessionStorage.setItem("ballotInput", JSON.stringify(ballot));
    }
  }

  return { profile, ballot };
}

/**
 * Save current sessionStorage data to Supabase for the logged-in user.
 */
export async function syncToSupabase(): Promise<void> {
  const profileStr = sessionStorage.getItem("valuesProfile");
  const ballotStr = sessionStorage.getItem("ballotInput");

  await Promise.all([
    profileStr
      ? saveValuesProfile(JSON.parse(profileStr) as ValuesProfile)
      : Promise.resolve(false),
    ballotStr
      ? saveBallotInput(JSON.parse(ballotStr) as BallotInput)
      : Promise.resolve(false),
  ]);
}
