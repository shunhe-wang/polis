import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AccountSummary } from "@/lib/freemium";
import { DEFAULT_ACCOUNT_SUMMARY } from "@/lib/freemium";
import {
  getAccountPlan,
  getCurrentEntitlements,
  isStripeConfigured,
} from "@/lib/billing";
import { getStarterAnalysisLimit, getStarterAnalysisRemaining } from "@/lib/ai-quotas";
import { getAccountTrustStatus } from "@/lib/account-trust";

export async function getAccountSummaryForUser(
  supabase: SupabaseClient,
  user: User | null
): Promise<AccountSummary> {
  if (!user) {
    return DEFAULT_ACCOUNT_SUMMARY;
  }

  const entitlements = await getCurrentEntitlements(supabase, user.id);
  const plan = getAccountPlan(user, entitlements);
  const trust = getAccountTrustStatus(user);
  const starterAnalysesRemaining =
    plan.tier === "free" && trust.trusted
      ? await getStarterAnalysisRemaining(supabase)
      : plan.tier === "pro"
        ? getStarterAnalysisLimit()
        : 0;

  return {
    tier: plan.tier,
    isAuthenticated: true,
    trustedAccount: trust.trusted,
    emailVerified: trust.emailVerified,
    trustReason: trust.reason,
    planKey: plan.planKey,
    planLabel: plan.planLabel,
    starterAnalysesRemaining,
    electionPassCredits: entitlements.election_pass_credits,
    powerPassRunsRemaining: entitlements.power_pass_runs_remaining,
    powerPassExpiresAt: entitlements.power_pass_expires_at,
    checkoutConfigured: isStripeConfigured(),
  };
}
