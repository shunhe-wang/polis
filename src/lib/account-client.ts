import {
  DEFAULT_ACCOUNT_SUMMARY,
  type AccountSummary,
} from "@/lib/freemium";
import { createClient } from "@/lib/supabase/client";

export async function getAccountSummary(): Promise<AccountSummary> {
  try {
    const response = await fetch("/api/account", {
      cache: "no-store",
    });

    if (!response.ok) {
      return DEFAULT_ACCOUNT_SUMMARY;
    }

    const data = (await response.json()) as Partial<AccountSummary>;
    if (
      (data.tier === "guest" ||
        data.tier === "free" ||
        data.tier === "pro") &&
      typeof data.isAuthenticated === "boolean" &&
      typeof data.starterAnalysesRemaining === "number" &&
      (data.planKey === "guest" ||
        data.planKey === "free" ||
        data.planKey === "election_pass" ||
        data.planKey === "bundle_3" ||
        data.planKey === "power_14d") &&
      typeof data.planLabel === "string" &&
      typeof data.electionPassCredits === "number" &&
      typeof data.powerPassRunsRemaining === "number" &&
      typeof data.checkoutConfigured === "boolean" &&
      (data.powerPassExpiresAt === null ||
        typeof data.powerPassExpiresAt === "string")
    ) {
      if (data.tier !== "guest") {
        return data as AccountSummary;
      }

      // Right after auth redirects, server cookies can lag the browser session.
      // Fall back to browser auth so signed-in users still land on the free tier
      // instead of a misleading guest gate.
      const supabase = createClient();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          return {
            ...DEFAULT_ACCOUNT_SUMMARY,
            tier: "free",
            isAuthenticated: true,
            planKey: "free",
            planLabel: "Free",
            checkoutConfigured: data.checkoutConfigured,
            starterAnalysesRemaining: 1,
            electionPassCredits: 0,
            powerPassRunsRemaining: 0,
            powerPassExpiresAt: null,
          };
        }
      }

      return data as AccountSummary;
    }
  } catch {
    return DEFAULT_ACCOUNT_SUMMARY;
  }

  return DEFAULT_ACCOUNT_SUMMARY;
}
