import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AccountSummary } from "@/lib/freemium";
import { DEFAULT_ACCOUNT_SUMMARY } from "@/lib/freemium";
import {
  getAccountPlan,
  getCurrentEntitlements,
  isStripeConfigured,
} from "@/lib/billing";
import { getStarterAnalysisLimit, getStarterAnalysisRemaining } from "@/lib/ai-quotas";

export async function getAccountSummaryForUser(
  supabase: SupabaseClient,
  user: User | null
): Promise<AccountSummary> {
  if (!user) {
    return DEFAULT_ACCOUNT_SUMMARY;
  }

  const entitlements = await getCurrentEntitlements(supabase, user.id);
  const plan = getAccountPlan(user, entitlements);
  const starterAnalysesRemaining =
    plan.tier === "free"
      ? await getStarterAnalysisRemaining(supabase)
      : plan.tier === "pro"
        ? getStarterAnalysisLimit()
        : 0;

  return {
    tier: plan.tier,
    isAuthenticated: true,
    planKey: plan.planKey,
    planLabel: plan.planLabel,
    starterAnalysesRemaining,
    electionPassCredits: entitlements.election_pass_credits,
    powerPassRunsRemaining: entitlements.power_pass_runs_remaining,
    powerPassExpiresAt: entitlements.power_pass_expires_at,
    checkoutConfigured: isStripeConfigured(),
  };
}
