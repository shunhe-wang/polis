export function getPartyAbbreviation(party: string | null | undefined): string | null {
  if (!party) return null;

  const normalized = party.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "democrat" || normalized === "democratic") return "D";
  if (normalized === "republican") return "R";
  if (normalized === "independent") return "I";
  if (normalized === "green") return "G";
  if (normalized === "libertarian") return "L";
  if (normalized === "nonpartisan" || normalized === "non-partisan") return "NP";

  return null;
}

export function formatPartyInline(
  party: string | null | undefined
): string | null {
  if (!party) return null;

  const abbreviation = getPartyAbbreviation(party);
  if (abbreviation) {
    return `(${abbreviation})`;
  }

  return `(${party})`;
}

export function formatPartyDetail(
  party: string | null | undefined
): string | null {
  if (!party) return null;

  const abbreviation = getPartyAbbreviation(party);
  if (!abbreviation) {
    return party;
  }

  return `${party} (${abbreviation})`;
}
