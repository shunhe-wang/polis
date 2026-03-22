// Freemium gating logic.
// For MVP, "Pro" is determined by whether the user is signed in.
// This can be swapped for Stripe subscription checks later.

import { createClient } from "@/lib/supabase/client";

export type UserTier = "free" | "pro";

export async function getUserTier(): Promise<UserTier> {
  const supabase = createClient();
  if (!supabase) return "free";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // For MVP: signed in = Pro
  return user ? "pro" : "free";
}

export function canAccessFeature(
  tier: UserTier,
  feature: "values_profile" | "research" | "share" | "admin"
): boolean {
  switch (feature) {
    case "values_profile":
      // Everyone can fill out the questionnaire (teaser)
      return true;
    case "research":
      // Only Pro users can generate personalized research
      return tier === "pro";
    case "share":
      // Only Pro users can save and share
      return tier === "pro";
    case "admin":
      // Admin is Pro only
      return tier === "pro";
  }
}
