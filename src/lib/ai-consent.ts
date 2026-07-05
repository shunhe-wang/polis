import type { SupabaseClient } from "@supabase/supabase-js";

export const CURRENT_AI_CONSENT_VERSION = "2026-07-05-v1";
export const AI_CONSENT_REQUIRED_STATUS = 428;

export const AI_CONSENT_DISCLOSURE = {
  provider: "Z.AI",
  purpose:
    "Generate candidate research, ballot parsing, and personalized voter-guide analysis.",
  dataCategories: [
    "issue priorities and policy preferences",
    "political identity and free-text values",
    "ballot, race, candidate, and measure details",
    "uploaded or pasted ballot content",
  ],
} as const;

export interface AiConsentRecord {
  consent_version: string;
  granted_at: string | null;
  revoked_at: string | null;
}

export const AI_CONSENT_REQUIRED_PAYLOAD = {
  error:
    "Review and approve Z.AI data sharing before using this AI feature.",
  requiresAiConsent: true,
  consentVersion: CURRENT_AI_CONSENT_VERSION,
  consentUrl: "/ai-consent",
} as const;

export function hasCurrentAiConsent(
  record: AiConsentRecord | null | undefined
): boolean {
  return Boolean(
    record &&
      record.consent_version === CURRENT_AI_CONSENT_VERSION &&
      record.granted_at &&
      !record.revoked_at
  );
}

export async function userHasCurrentAiConsent(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_data_consents")
    .select("consent_version, granted_at, revoked_at")
    .eq("user_id", userId)
    .eq("consent_version", CURRENT_AI_CONSENT_VERSION)
    .maybeSingle();

  return !error && hasCurrentAiConsent(data);
}
