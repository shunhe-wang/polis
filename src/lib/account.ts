import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AccountSummary } from "@/lib/freemium";
import { DEFAULT_ACCOUNT_SUMMARY } from "@/lib/freemium";
import {
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
  const trust = getAccountTrustStatus(user);
  const starterAnalysesRemaining =
    trust.trusted
      ? Math.min(
          await getStarterAnalysisRemaining(supabase),
          getStarterAnalysisLimit()
        )
      : 0;

  return {
    isAuthenticated: true,
    trustedAccount: trust.trusted,
    emailVerified: trust.emailVerified,
    trustReason: trust.reason,
    starterAnalysesRemaining,
    electionPassCredits: entitlements.election_pass_credits,
    checkoutConfigured: isStripeConfigured(),
  };
}
