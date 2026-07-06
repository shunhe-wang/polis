import {
  AI_CONSENT_REQUIRED_STATUS,
} from "@/lib/ai-consent";
import { safeSessionStorageSet } from "@/lib/browser-storage";

interface AiConsentRequiredPayload {
  requiresAiConsent: true;
}

function isConsentRequiredPayload(
  value: unknown
): value is AiConsentRequiredPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "requiresAiConsent" in value &&
      value.requiresAiConsent === true
  );
}

export async function fetchWithAiConsent(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status !== AI_CONSENT_REQUIRED_STATUS) {
    return response;
  }

  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  if (isConsentRequiredPayload(payload) && typeof window !== "undefined") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    safeSessionStorageSet("aiConsentReturnTo", returnTo);
    window.location.assign("/ai-consent");
  }

  return response;
}
