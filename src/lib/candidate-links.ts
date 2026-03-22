import type { Candidate } from "@/lib/types";

export interface CandidateSourceLink {
  label: string;
  url: string;
}

function buildQuery(
  candidate: Candidate,
  raceName: string,
  state: string,
  extra?: string
): string {
  return [candidate.name, raceName, state, extra]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function buildCandidateSourceLinks(
  candidate: Candidate,
  raceName: string,
  state: string
): CandidateSourceLink[] {
  return [
    {
      label: "Search",
      url: `https://www.google.com/search?q=${encodeURIComponent(
        buildQuery(candidate, raceName, state)
      )}`,
    },
    {
      label: "News",
      url: `https://www.google.com/search?tbm=nws&q=${encodeURIComponent(
        buildQuery(candidate, raceName, state)
      )}`,
    },
    {
      label: "Ballotpedia",
      url: `https://www.google.com/search?q=${encodeURIComponent(
        buildQuery(candidate, raceName, state, "site:ballotpedia.org")
      )}`,
    },
    {
      label: "Campaign",
      url: `https://www.google.com/search?q=${encodeURIComponent(
        buildQuery(candidate, raceName, state, "campaign official site")
      )}`,
    },
  ];
}
