import type {
  CandidateResult,
  CitedClaim,
  IssueAlignment,
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
    likes: result.likes.map(sanitizeCitedClaim),
    concerns: result.concerns.map(sanitizeCitedClaim),
  };
}

export function sanitizeMeasureResult(result: MeasureResult): MeasureResult {
  return {
    ...result,
    title: sanitizeResearchText(result.title),
    summary: sanitizeResearchText(result.summary),
    reasoning: sanitizeResearchText(result.reasoning),
    prosForVoter: result.prosForVoter.map(sanitizeCitedClaim),
    consForVoter: result.consForVoter.map(sanitizeCitedClaim),
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
