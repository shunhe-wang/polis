export type UserTier = "guest" | "free" | "pro";

export interface AccountSummary {
  tier: UserTier;
  isAuthenticated: boolean;
  planKey: "guest" | "free" | "election_pass" | "bundle_3" | "power_14d";
  planLabel: string;
  starterAnalysesRemaining: number;
  electionPassCredits: number;
  powerPassRunsRemaining: number;
  powerPassExpiresAt: string | null;
  checkoutConfigured: boolean;
}

export const DEFAULT_ACCOUNT_SUMMARY: AccountSummary = {
  tier: "guest",
  isAuthenticated: false,
  planKey: "guest",
  planLabel: "Guest",
  starterAnalysesRemaining: 0,
  electionPassCredits: 0,
  powerPassRunsRemaining: 0,
  powerPassExpiresAt: null,
  checkoutConfigured: false,
};

export function canAccessFeature(
  tier: UserTier,
  feature:
    | "values_profile"
    | "starter_analysis"
    | "research"
    | "share"
    | "admin"
): boolean {
  switch (feature) {
    case "values_profile":
      // Anyone can complete onboarding.
      return true;
    case "starter_analysis":
      // Starter analysis is available to signed-in free users and Pro.
      return tier === "free" || tier === "pro";
    case "research":
      // Full-ballot personalized research is Pro-only.
      return tier === "pro";
    case "share":
      // Save/share stays Pro-only until billing is wired up.
      return tier === "pro";
    case "admin":
      // Admin is still separate server-side allowlist.
      return tier === "pro";
  }
}
