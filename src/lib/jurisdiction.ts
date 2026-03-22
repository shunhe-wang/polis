function normalizePart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildJurisdictionKey(input: {
  state: string | null;
  county?: string | null;
  city?: string | null;
}): string {
  return [
    normalizePart(input.state),
    normalizePart(input.county),
    normalizePart(input.city),
  ].join("::");
}

export function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const normalized = state.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}
