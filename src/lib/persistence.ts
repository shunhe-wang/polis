import { createClient } from "@/lib/supabase/client";
import type { ValuesProfile, BallotInput } from "@/lib/types";

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
    .select("issue_ratings, free_text, political_identity")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;

  return {
    issueRatings: data.issue_ratings,
    freeText: data.free_text,
    politicalIdentity: data.political_identity,
  };
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

  // Store ballot as a user setting using the values_profiles table
  // We'll add a ballot_input column, but for now use localStorage as bridge
  // and persist through the voter_guides table when guide is saved
  sessionStorage.setItem("ballotInput", JSON.stringify(ballot));
  return true;
}

// ─── Sync helper ──────────────────────────────────────────────────

/**
 * On app load, if the user is logged in, try to load their saved
 * profile from Supabase and populate sessionStorage if it's empty.
 */
export async function syncFromSupabase(): Promise<{
  profile: ValuesProfile | null;
}> {
  const profile = await loadValuesProfile();

  if (profile) {
    const existing = sessionStorage.getItem("valuesProfile");
    if (!existing) {
      sessionStorage.setItem("valuesProfile", JSON.stringify(profile));
    }
  }

  return { profile };
}

/**
 * Save current sessionStorage data to Supabase for the logged-in user.
 */
export async function syncToSupabase(): Promise<void> {
  const profileStr = sessionStorage.getItem("valuesProfile");
  if (profileStr) {
    const profile = JSON.parse(profileStr) as ValuesProfile;
    await saveValuesProfile(profile);
  }
}
