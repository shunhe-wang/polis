import { describe, expect, it } from "vitest";
import {
  AI_CONSENT_DISCLOSURE,
  CURRENT_AI_CONSENT_VERSION,
  hasCurrentAiConsent,
} from "./ai-consent";

describe("AI data-sharing consent", () => {
  it("accepts only an active grant for the current disclosure version", () => {
    expect(
      hasCurrentAiConsent({
        consent_version: CURRENT_AI_CONSENT_VERSION,
        granted_at: "2026-07-05T12:00:00.000Z",
        revoked_at: null,
      })
    ).toBe(true);

    expect(
      hasCurrentAiConsent({
        consent_version: "outdated-version",
        granted_at: "2026-07-05T12:00:00.000Z",
        revoked_at: null,
      })
    ).toBe(false);

    expect(
      hasCurrentAiConsent({
        consent_version: CURRENT_AI_CONSENT_VERSION,
        granted_at: "2026-07-05T12:00:00.000Z",
        revoked_at: "2026-07-05T13:00:00.000Z",
      })
    ).toBe(false);
  });

  it("names Z.AI and the sensitive data categories before consent", () => {
    expect(AI_CONSENT_DISCLOSURE.provider).toBe("Z.AI");
    expect(AI_CONSENT_DISCLOSURE.dataCategories).toEqual(
      expect.arrayContaining([
        "issue priorities and policy preferences",
        "political identity and free-text values",
        "ballot, race, candidate, and measure details",
        "uploaded or pasted ballot content",
      ])
    );
  });
});
