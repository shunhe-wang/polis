import type {
  CandidateDossier,
  CandidateResult,
  CitedClaim,
  IssueAlignment,
  MeasureDossier,
  MeasureResult,
  RaceRecommendation,
} from "@/lib/types";

const CITE_TAG_PATTERN = /<\/?cite\b[^>]*>/gi;
const XML_TAG_PATTERN = /<\/?(?:search_result|source)\b[^>]*>/gi;

export function sanitizeResearchText(text: string): string {
  return text
    .replace(CITE_TAG_PATTERN, "")
    .replace(XML_TAG_PATTERN, "")
    .replace(/\[\d+(?:[-,]\d+)*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

// These sanitizers run on raw, unvalidated AI output before the structural
// validators. They must never throw on malformed shapes: anything that is not
// the expected type passes through untouched so the validator can reject it
// (and the caller's retry-on-invalid branch can run) instead of a TypeError
// short-circuiting to a 5xx.
function sanitizeTextField<T>(value: T): T | string {
  return typeof value === "string" ? sanitizeResearchText(value) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeCitedClaim(claim: CitedClaim): CitedClaim {
  if (!isRecord(claim)) return claim;
  return {
    ...claim,
    text: sanitizeTextField(claim.text),
    sourceTitle: sanitizeTextField(claim.sourceTitle),
  } as CitedClaim;
}

function hasUsableSource(claim: CitedClaim): boolean {
  return (
    isRecord(claim) &&
    typeof claim.text === "string" &&
    claim.text.trim().length > 0 &&
    typeof claim.sourceUrl === "string" &&
    claim.sourceUrl.trim().length > 0 &&
    typeof claim.sourceTitle === "string" &&
    claim.sourceTitle.trim().length > 0
  );
}

// Sanitize claims and drop any that lack a usable source. The AI honestly
// returns source-less claims for candidates and measures with thin public
// coverage; keeping them would fail cited-claim validation and reject the whole
// (otherwise useful) dossier or result. Dropping them yields a valid, honestly
// source-light payload instead of a hard failure.
function sanitizeCitedClaims(claims: CitedClaim[]): CitedClaim[] {
  if (!Array.isArray(claims)) return claims;
  return claims.map(sanitizeCitedClaim).filter(hasUsableSource);
}

function sanitizeIssueAlignment(alignment: IssueAlignment): IssueAlignment {
  if (!isRecord(alignment)) return alignment;
  return {
    ...alignment,
    summary: sanitizeTextField(alignment.summary),
    candidatePosition: sanitizeTextField(alignment.candidatePosition),
  } as IssueAlignment;
}

function sanitizeIssueEvidence<T>(notes: T[]): T[] {
  if (!Array.isArray(notes)) return notes;
  return notes.map((note) =>
    isRecord(note)
      ? ({
          ...note,
          summary: sanitizeTextField(note.summary),
          stance: sanitizeTextField(note.stance),
        } as T)
      : note
  );
}

export function sanitizeCandidateResult(
  result: CandidateResult
): CandidateResult {
  if (!isRecord(result)) return result;
  return {
    ...result,
    name: sanitizeTextField(result.name),
    race: sanitizeTextField(result.race),
    reasoning: sanitizeTextField(result.reasoning),
    issueBreakdown: Array.isArray(result.issueBreakdown)
      ? result.issueBreakdown.map(sanitizeIssueAlignment)
      : result.issueBreakdown,
    likes: sanitizeCitedClaims(result.likes),
    concerns: sanitizeCitedClaims(result.concerns),
  } as CandidateResult;
}

export function sanitizeCandidateDossier(
  dossier: CandidateDossier
): CandidateDossier {
  if (!isRecord(dossier)) return dossier;
  return {
    ...dossier,
    overview: sanitizeTextField(dossier.overview),
    issueEvidence: sanitizeIssueEvidence(dossier.issueEvidence),
    strengths: sanitizeCitedClaims(dossier.strengths),
    concerns: sanitizeCitedClaims(dossier.concerns),
  } as CandidateDossier;
}

export function sanitizeMeasureResult(result: MeasureResult): MeasureResult {
  if (!isRecord(result)) return result;
  return {
    ...result,
    title: sanitizeTextField(result.title),
    summary: sanitizeTextField(result.summary),
    reasoning: sanitizeTextField(result.reasoning),
    prosForVoter: sanitizeCitedClaims(result.prosForVoter),
    consForVoter: sanitizeCitedClaims(result.consForVoter),
  } as MeasureResult;
}

export function sanitizeMeasureDossier(dossier: MeasureDossier): MeasureDossier {
  if (!isRecord(dossier)) return dossier;
  return {
    ...dossier,
    summary: sanitizeTextField(dossier.summary),
    yesCase: sanitizeCitedClaims(dossier.yesCase),
    noCase: sanitizeCitedClaims(dossier.noCase),
    issueEvidence: sanitizeIssueEvidence(dossier.issueEvidence),
  } as MeasureDossier;
}

export function sanitizeRaceRecommendation(
  recommendation: RaceRecommendation
): RaceRecommendation {
  if (!isRecord(recommendation)) return recommendation;
  return {
    ...recommendation,
    raceName: sanitizeTextField(recommendation.raceName),
    explanation: sanitizeTextField(recommendation.explanation),
    candidates: Array.isArray(recommendation.candidates)
      ? recommendation.candidates.map(sanitizeCandidateResult)
      : recommendation.candidates,
  } as RaceRecommendation;
}
