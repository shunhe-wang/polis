import type { BallotInput, BallotReviewDraft } from "@/lib/types";

export type BallotDraftQuality = "high" | "medium" | "low";

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }

  return output;
}

export function normalizeBallotReviewDraft(
  draft: BallotReviewDraft
): BallotReviewDraft {
  const races = draft.races
    .map((race) => ({
      ...race,
      name: cleanText(race.name),
      contestType: cleanText(race.contestType) || null,
      candidates: race.candidates
        .map((candidate) => ({
          name: cleanText(candidate.name),
          party: cleanText(candidate.party) || null,
        }))
        .filter((candidate) => candidate.name.length > 0)
        .filter((candidate, index, candidates) => {
          const key = `${candidate.name.toLowerCase()}::${candidate.party ?? ""}`;
          return (
            candidates.findIndex(
              (other) =>
                `${other.name.toLowerCase()}::${other.party ?? ""}` === key
            ) === index
          );
        }),
    }))
    .filter((race) => race.name.length > 0);

  const measures = draft.measures
    .map((measure) => ({
      ...measure,
      title: cleanText(measure.title),
      description: cleanText(measure.description),
    }))
    .filter((measure) => measure.title.length > 0)
    .filter((measure, index, measuresList) => {
      const key = measure.title.toLowerCase();
      return (
        measuresList.findIndex((other) => other.title.toLowerCase() === key) ===
        index
      );
    });

  const derivedNotes: string[] = [];
  if (races.length === 0 && measures.length === 0) {
    derivedNotes.push("No races or measures were confidently extracted.");
  }
  if (races.some((race) => race.candidates.length === 0)) {
    derivedNotes.push("Some races are missing candidate names and should be verified.");
  }
  if (measures.some((measure) => measure.description.length < 20)) {
    derivedNotes.push("Some ballot-measure descriptions look thin and should be checked against the official ballot.");
  }

  return {
    election: draft.election
      ? {
          name: cleanText(draft.election.name) || null,
          electionDay: cleanText(draft.election.electionDay) || null,
          kind: draft.election.kind,
          selectedParty: cleanText(draft.election.selectedParty) || null,
        }
      : null,
    races,
    measures,
    confidence: Math.max(0, Math.min(100, Math.round(draft.confidence))),
    notes: uniqueStrings([...draft.notes, ...derivedNotes]),
  };
}

export function getBallotDraftQuality(confidence: number): BallotDraftQuality {
  if (confidence >= 80) return "high";
  if (confidence >= 55) return "medium";
  return "low";
}

export function getBallotDraftQualityLabel(confidence: number): string {
  const quality = getBallotDraftQuality(confidence);
  if (quality === "high") return "High-confidence draft";
  if (quality === "medium") return "Needs review";
  return "Low-confidence draft";
}

export function getBallotDraftReviewHint(
  draft: Pick<BallotReviewDraft, "confidence" | "races" | "measures">
): string {
  const quality = getBallotDraftQuality(draft.confidence);

  if (quality === "high") {
    return "This parse looks solid, but still compare it against the official ballot before you continue.";
  }

  if (quality === "medium") {
    return "Review each race and measure carefully before applying this draft.";
  }

  if (draft.races.length === 0 && draft.measures.length === 0) {
    return "Polis could not confidently read this ballot. Try a clearer file, paste more text, or compare against the official source page-by-page.";
  }

  return "This parse may be incomplete. Compare every page of the official ballot before applying it.";
}

export function getBallotDraftImportMessage(
  source: "pasted_text" | "uploaded_file",
  draft: Pick<BallotReviewDraft, "confidence" | "races" | "measures">
): string {
  const sourceLabel =
    source === "uploaded_file" ? "uploaded ballot file" : "pasted ballot text";
  const quality = getBallotDraftQuality(draft.confidence);

  if (quality === "low") {
    return `Parsed from ${sourceLabel}, but the result looks low-confidence. Review every race and measure before continuing.`;
  }

  if (quality === "medium") {
    return `Parsed from ${sourceLabel}. Review candidate names, parties, and measures before continuing.`;
  }

  return `Parsed from ${sourceLabel}. Compare it against the official ballot one more time before continuing.`;
}

export function getFriendlyBallotDraftParseError(
  error: unknown,
  source: "text" | "file"
): string {
  const fallback =
    source === "file"
      ? "Could not parse this ballot file. Try a clearer PDF/image or paste the ballot text instead."
      : "Could not parse this ballot text. Paste more of the ballot, including race titles and candidate names.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes("invalid") || message.includes("parse")) {
    return fallback;
  }

  if (message.includes("empty") || message.includes("no races or measures")) {
    return source === "file"
      ? "Polis could not confidently find races or measures in that file. Try a clearer ballot PDF/image or paste the text from the official ballot page."
      : "Polis could not confidently find races or measures in that text. Paste more of the ballot, including the election title and each race heading.";
  }

  if (message.includes("rate limited")) {
    return "Ballot parsing is temporarily rate limited. Wait a few minutes and try again.";
  }

  return fallback;
}

export function getAppliedDraftSummary(ballot: BallotInput): string | null {
  const confidence = ballot.importMeta?.confidence ?? null;
  if (confidence === null) return null;

  return getBallotDraftReviewHint({
    confidence,
    races: ballot.races.map((race) => ({
      name: race.name,
      level: race.level,
      contestType: race.contestType ?? null,
      candidates: race.candidates.map((candidate) => ({
        name: candidate.name,
        party: candidate.party,
      })),
    })),
    measures: ballot.measures.map((measure) => ({
      title: measure.title,
      description: measure.description,
      type: measure.type,
    })),
  });
}
