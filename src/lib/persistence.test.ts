import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BallotInput } from "@/lib/types";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/client";
import {
  saveBallotInput,
  syncFromSupabase,
} from "@/lib/persistence";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

function createSupabaseMock(options?: {
  profile?: Record<string, unknown> | null;
  ballot?: BallotInput | null;
  upsertError?: { message: string } | null;
}) {
  const profile = options?.profile ?? null;
  const ballot = options?.ballot ?? null;
  const upsertError = options?.upsertError ?? null;

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "saved_ballots") {
        return {
          upsert: vi.fn().mockResolvedValue({ error: upsertError }),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                ballot
                  ? { data: { ballot_input: ballot }, error: null }
                  : { data: null, error: { message: "Not found" } }
              ),
            })),
          })),
        };
      }

      if (table === "values_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                profile
                  ? { data: profile, error: null }
                  : { data: null, error: { message: "Not found" } }
              ),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it("saves ballot input to Supabase and sessionStorage", async () => {
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock()
    );

    const ballot: BallotInput = {
      address: "123 Main St",
      state: "CA",
      election: null,
      races: [],
      measures: [],
    };

    await expect(saveBallotInput(ballot)).resolves.toBe(true);
    expect(sessionStorage.getItem("ballotInput")).toBe(
      JSON.stringify(ballot)
    );
  });

  it("hydrates profile and ballot from Supabase when session storage is empty", async () => {
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock({
        profile: {
          issue_ratings: {
            economy: 3,
            healthcare: 3,
            climate: 3,
            immigration: 3,
            housing: 5,
            civil_liberties: 3,
            foreign_policy: 3,
            education: 3,
            crypto_tech: 3,
          },
          policy_signals: {
            taxes_and_spending: "more_public_investment",
            immigration_approach: null,
            housing_growth: null,
            social_rights: null,
            energy_and_climate: null,
          },
          free_text: "Housing first.",
          political_identity: "moderate",
        },
        ballot: {
          address: "123 Main St",
          state: "CA",
          election: null,
          races: [],
          measures: [],
        },
      })
    );

    const hydrated = await syncFromSupabase();

    expect(hydrated.profile?.freeText).toBe("Housing first.");
    expect(hydrated.profile?.policySignals.taxes_and_spending).toBe(
      "more_public_investment"
    );
    expect(hydrated.ballot?.state).toBe("CA");
    expect(sessionStorage.getItem("valuesProfile")).not.toBeNull();
    expect(sessionStorage.getItem("ballotInput")).not.toBeNull();
  });
});
