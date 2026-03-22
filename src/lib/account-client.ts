import {
  DEFAULT_ACCOUNT_SUMMARY,
  type AccountSummary,
} from "@/lib/freemium";

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
      typeof data.starterAnalysesRemaining === "number"
    ) {
      return data as AccountSummary;
    }
  } catch {
    return DEFAULT_ACCOUNT_SUMMARY;
  }

  return DEFAULT_ACCOUNT_SUMMARY;
}
