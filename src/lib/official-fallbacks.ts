import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBallotFallbackLinks } from "@/lib/ballot-fallbacks";
import { buildJurisdictionKey, normalizeStateCode } from "@/lib/jurisdiction";
import { getStateVotingPage } from "@/lib/state-voting-pages";
import type { BallotElectionContext, BallotFallbackLink } from "@/lib/types";

interface FallbackRow {
  official_elections_url: string;
  official_sample_ballot_url: string | null;
  official_voter_lookup_url: string | null;
}

function rankFallbackLink(link: BallotFallbackLink): number {
  if (link.kind === "official") {
    if (link.label.toLowerCase().includes("sample ballot")) return 0;
    if (link.label.toLowerCase().includes("voter lookup")) return 1;
    if (link.label.toLowerCase().includes("vote.gov")) return 2;
    if (link.label.toLowerCase().includes("election office")) return 3;
    return 4;
  }

  if (link.kind === "official_search") return 5;
  if (link.kind === "reference") return 6;
  return 7;
}

export async function resolveOfficialFallbackLinks(
  supabase: SupabaseClient | null,
  input: {
    address: string;
    state: string | null;
    city: string | null;
    county?: string | null;
    election: BallotElectionContext | null;
  }
): Promise<BallotFallbackLink[]> {
  const fallbackLinks: BallotFallbackLink[] = [];
  const state = normalizeStateCode(input.state);

  if (supabase && state) {
    const keys = [
      buildJurisdictionKey({
        state,
        county: input.county ?? null,
        city: input.city,
      }),
      buildJurisdictionKey({
        state,
        county: null,
        city: input.city,
      }),
      buildJurisdictionKey({
        state,
        county: null,
        city: null,
      }),
    ];

    const { data } = await supabase
      .from("jurisdiction_fallbacks")
      .select(
        "official_elections_url, official_sample_ballot_url, official_voter_lookup_url, jurisdiction_key"
      )
      .in("jurisdiction_key", keys)
      .limit(3);

    const rows = Array.isArray(data) ? (data as Array<FallbackRow>) : [];

    for (const row of rows) {
      if (row.official_sample_ballot_url) {
        fallbackLinks.push({
          label: "Official sample ballot",
          url: row.official_sample_ballot_url,
          kind: "official",
        });
      }
      if (row.official_voter_lookup_url) {
        fallbackLinks.push({
          label: "Official voter lookup",
          url: row.official_voter_lookup_url,
          kind: "official",
        });
      }
      if (row.official_elections_url) {
        fallbackLinks.push({
          label: "Official election office",
          url: row.official_elections_url,
          kind: "official",
        });
      }
    }
  }

  const stateVotingPage = getStateVotingPage(state);
  if (stateVotingPage) {
    fallbackLinks.push({
      label: stateVotingPage.label,
      url: stateVotingPage.url,
      kind: "official",
    });
  }

  const generic = buildBallotFallbackLinks({
    address: input.address,
    state,
    city: input.city,
    county: input.county ?? null,
    election: input.election,
  });

  const deduped = new Map<string, BallotFallbackLink>();
  for (const link of [...fallbackLinks, ...generic]) {
    if (!deduped.has(link.url)) {
      deduped.set(link.url, link);
    }
  }

  return Array.from(deduped.values()).sort(
    (left, right) => rankFallbackLink(left) - rankFallbackLink(right)
  );
}
