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

function sanitizeCitedClaim(claim: CitedClaim): CitedClaim {
  return {
    ...claim,
    text: sanitizeResearchText(claim.text),
    sourceTitle: sanitizeResearchText(claim.sourceTitle),
  };
}

function hasUsableSource(claim: CitedClaim): boolean {
  return (
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
  return claims.map(sanitizeCitedClaim).filter(hasUsableSource);
}

function sanitizeIssueAlignment(alignment: IssueAlignment): IssueAlignment {
  return {
    ...alignment,
    summary: sanitizeResearchText(alignment.summary),
    candidatePosition: sanitizeResearchText(alignment.candidatePosition),
  };
}

export function sanitizeCandidateResult(
  result: CandidateResult
): CandidateResult {
  return {
    ...result,
    name: sanitizeResearchText(result.name),
    race: sanitizeResearchText(result.race),
    reasoning: sanitizeResearchText(result.reasoning),
    issueBreakdown: result.issueBreakdown.map(sanitizeIssueAlignment),
    likes: sanitizeCitedClaims(result.likes),
    concerns: sanitizeCitedClaims(result.concerns),
  };
}

export function sanitizeCandidateDossier(
  dossier: CandidateDossier
): CandidateDossier {
  return {
    ...dossier,
    overview: sanitizeResearchText(dossier.overview),
    issueEvidence: dossier.issueEvidence.map((note) => ({
      ...note,
      summary: sanitizeResearchText(note.summary),
      stance: sanitizeResearchText(note.stance),
    })),
    strengths: sanitizeCitedClaims(dossier.strengths),
    concerns: sanitizeCitedClaims(dossier.concerns),
  };
}

export function sanitizeMeasureResult(result: MeasureResult): MeasureResult {
  return {
    ...result,
    title: sanitizeResearchText(result.title),
    summary: sanitizeResearchText(result.summary),
    reasoning: sanitizeResearchText(result.reasoning),
    prosForVoter: sanitizeCitedClaims(result.prosForVoter),
    consForVoter: sanitizeCitedClaims(result.consForVoter),
  };
}

export function sanitizeMeasureDossier(dossier: MeasureDossier): MeasureDossier {
  return {
    ...dossier,
    summary: sanitizeResearchText(dossier.summary),
    yesCase: sanitizeCitedClaims(dossier.yesCase),
    noCase: sanitizeCitedClaims(dossier.noCase),
    issueEvidence: dossier.issueEvidence.map((note) => ({
      ...note,
      summary: sanitizeResearchText(note.summary),
      stance: sanitizeResearchText(note.stance),
    })),
  };
}

export function sanitizeRaceRecommendation(
  recommendation: RaceRecommendation
): RaceRecommendation {
  return {
    ...recommendation,
    raceName: sanitizeResearchText(recommendation.raceName),
    explanation: sanitizeResearchText(recommendation.explanation),
    candidates: recommendation.candidates.map(sanitizeCandidateResult),
  };
}
