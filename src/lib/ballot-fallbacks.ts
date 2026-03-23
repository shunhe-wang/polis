import type { BallotElectionContext, BallotFallbackLink } from "@/lib/types";

function encodeSearch(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function buildBallotFallbackLinks(input: {
  address: string;
  state: string | null;
  city?: string | null;
  county?: string | null;
  election: BallotElectionContext | null;
}): BallotFallbackLink[] {
  const localityBits = [input.city, input.county, input.state]
    .map((value) => value?.trim())
    .filter(Boolean);
  const location =
    input.address || localityBits.join(", ") || input.state || "my address";
  const electionLabel = input.election?.name ?? "upcoming election";
  const officialQuery = `site:.gov ${location} sample ballot ${electionLabel}`;
  const officeQuery = `site:.gov ${location} election office sample ballot`;
  const newsQuery = `"${location}" "${electionLabel}" candidate guide`;

  return [
    {
      label: "USA.gov election office directory",
      url: "https://www.usa.gov/state-election-office",
      kind: "official",
    },
    {
      label: "Vote.gov election resources",
      url: "https://vote.gov",
      kind: "official",
    },
    {
      label: "Search official sample ballot",
      url: encodeSearch(officialQuery),
      kind: "official_search",
    },
    {
      label: "Find election office",
      url: encodeSearch(officeQuery),
      kind: "official_search",
    },
    {
      label: "VOTE411 ballot lookup",
      url: "https://www.vote411.org/ballot",
      kind: "reference",
    },
    {
      label: "Ballotpedia sample ballot",
      url: "https://ballotpedia.org/Sample_Ballot_Lookup",
      kind: "reference",
    },
    {
      label: "News and local guides",
      url: encodeSearch(newsQuery),
      kind: "news",
    },
  ];
}

export function getBallotSourceNotice(
  raceCount: number,
  measureCount: number,
  election: BallotElectionContext | null
): string {
  const electionCopy = election
    ? `${election.name} ballot`
    : "ballot import";

  if (raceCount === 0 && measureCount === 0) {
    return `We could not import your ${electionCopy} from Google Civic. Open an official election source, then add missing races manually or upload/paste the ballot for review.`;
  }

  if (measureCount === 0) {
    return `This ${electionCopy} came from Google Civic. It may miss local measures or precinct-specific contests, so verify it against an official sample ballot.`;
  }

  return `Imported from Google Civic. Verify the final list against an official sample ballot if your county has local or precinct-specific contests.`;
}
