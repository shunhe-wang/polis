import {
  ISSUES,
  POLICY_SIGNALS,
  POLICY_SIGNAL_CHOICES,
  POLITICAL_IDENTITIES,
  type BallotInput,
  type BallotReviewDraft,
  type BallotFallbackLink,
  type BallotImportMeta,
  type BallotMeasure,
  type Candidate,
  type CandidateDossier,
  type CandidateResult,
  type CitedClaim,
  type Issue,
  type IssueAlignment,
  type MeasureDossier,
  type MeasureResult,
  type Race,
  type RaceRecommendation,
  type ValuesProfile,
} from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIntegerInRange(
  value: unknown,
  min: number,
  max: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isIssue(value: unknown): value is Issue {
  return isString(value) && (ISSUES as readonly string[]).includes(value);
}

function isValidPolicySignals(value: unknown): boolean {
  if (!isRecord(value)) return false;

  for (const signal of POLICY_SIGNALS) {
    const current = value[signal];
    const choices = POLICY_SIGNAL_CHOICES[signal] as readonly string[];
    if (current !== null && current !== undefined && !choices.includes(String(current))) {
      return false;
    }
  }

  return true;
}

function isCitedClaim(value: unknown): value is CitedClaim {
  if (!isRecord(value)) return false;
  return (
    isString(value.text) &&
    value.text.trim().length > 0 &&
    isString(value.sourceUrl) &&
    value.sourceUrl.trim().length > 0 &&
    isString(value.sourceTitle) &&
    value.sourceTitle.trim().length > 0
  );
}

function isIssueAlignment(value: unknown): value is IssueAlignment {
  if (!isRecord(value)) return false;
  return (
    isIssue(value.issue) &&
    isIntegerInRange(value.score, 0, 100) &&
    isString(value.summary) &&
    isString(value.candidatePosition) &&
    isIntegerInRange(value.userPriority, 1, 5)
  );
}

function isDossierIssueNote(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isIssue(value.issue) &&
    isString(value.summary) &&
    isString(value.stance)
  );
}

export function isValidCandidate(value: unknown): value is Candidate {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isNullableString(value.party)
  );
}

export function isValidRace(value: unknown): value is Race {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return false;
  return (
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    (value.contestType === undefined || isString(value.contestType)) &&
    (value.level === "federal" ||
      value.level === "state" ||
      value.level === "local") &&
    value.candidates.every(isValidCandidate)
  );
}

function isValidElectionContext(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;

  return (
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isString(value.electionDay) &&
    value.electionDay.trim().length > 0 &&
    (value.kind === "primary" ||
      value.kind === "general" ||
      value.kind === "special" ||
      value.kind === "other") &&
    isNullableString(value.selectedParty)
  );
}

function isBallotMeasure(value: unknown): value is BallotMeasure {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.id.trim().length > 0 &&
    isString(value.title) &&
    value.title.trim().length > 0 &&
    isString(value.description) &&
    (value.type === "referendum" ||
      value.type === "initiative" ||
      value.type === "amendment" ||
      value.type === "other")
  );
}

function isBallotFallbackLink(value: unknown): value is BallotFallbackLink {
  if (!isRecord(value)) return false;
  return (
    isString(value.label) &&
    value.label.trim().length > 0 &&
    isString(value.url) &&
    value.url.trim().length > 0 &&
    (value.kind === "official_search" ||
      value.kind === "reference" ||
      value.kind === "news" ||
      value.kind === "official")
  );
}

function isBallotImportMeta(value: unknown): value is BallotImportMeta {
  if (value === null || value === undefined) return true;
  if (!isRecord(value) || !Array.isArray(value.fallbackLinks)) return false;

  const locality = value.locality;
  const localityValid =
    locality === null ||
    locality === undefined ||
    (isRecord(locality) &&
      isNullableString(locality.city) &&
      isNullableString(locality.county) &&
      isNullableString(locality.state) &&
      isNullableString(locality.zip));

  return (
    (value.importId === null || isString(value.importId)) &&
    (value.source === "google_civic" ||
      value.source === "official_upload" ||
      value.source === "manual" ||
      value.source === "licensed_provider") &&
    (value.status === "complete" ||
      value.status === "partial" ||
      value.status === "unavailable") &&
    typeof value.confidence === "number" &&
    value.confidence >= 0 &&
    value.confidence <= 100 &&
    isNullableString(value.message) &&
    value.fallbackLinks.every(isBallotFallbackLink) &&
    localityValid
  );
}

export function isValidBallotReviewDraft(
  value: unknown
): value is BallotReviewDraft {
  if (!isRecord(value) || !Array.isArray(value.races) || !Array.isArray(value.measures) || !Array.isArray(value.notes)) {
    return false;
  }

  const election =
    value.election === null ||
    value.election === undefined ||
    (isRecord(value.election) &&
      (value.election.name === null || isString(value.election.name)) &&
      (value.election.electionDay === null || isString(value.election.electionDay)) &&
      (value.election.kind === null ||
        value.election.kind === "primary" ||
        value.election.kind === "general" ||
        value.election.kind === "special" ||
        value.election.kind === "other") &&
      isNullableString(value.election.selectedParty));

  const races = value.races.every(
    (race) =>
      isRecord(race) &&
      isString(race.name) &&
      (race.level === "federal" ||
        race.level === "state" ||
        race.level === "local") &&
      (race.contestType === null ||
        race.contestType === undefined ||
        isString(race.contestType)) &&
      Array.isArray(race.candidates) &&
      race.candidates.every(
        (candidate) =>
          isRecord(candidate) &&
          isString(candidate.name) &&
          candidate.name.trim().length > 0 &&
          isNullableString(candidate.party)
      )
  );

  const measures = value.measures.every(
    (measure) =>
      isRecord(measure) &&
      isString(measure.title) &&
      isString(measure.description) &&
      (measure.type === "referendum" ||
        measure.type === "initiative" ||
        measure.type === "amendment" ||
        measure.type === "other")
  );

  return (
    election &&
    races &&
    measures &&
    typeof value.confidence === "number" &&
    value.confidence >= 0 &&
    value.confidence <= 100 &&
    value.notes.every((note) => isString(note))
  );
}

export function isValidValuesProfile(value: unknown): value is ValuesProfile {
  if (!isRecord(value) || !isRecord(value.issueRatings)) return false;

  for (const issue of ISSUES) {
    if (!isIntegerInRange(value.issueRatings[issue], 1, 5)) {
      return false;
    }
  }

  return (
    isValidPolicySignals(value.policySignals) &&
    isString(value.freeText) &&
    value.freeText.length <= 1000 &&
    (value.politicalIdentity === null ||
      ((POLITICAL_IDENTITIES as readonly string[]).includes(
        value.politicalIdentity as string
      ) &&
        isString(value.politicalIdentity)))
  );
}

export function isValidBallotInput(value: unknown): value is BallotInput {
  if (
    !isRecord(value) ||
    !Array.isArray(value.races) ||
    !Array.isArray(value.measures)
  ) {
    return false;
  }

  return (
    isString(value.address) &&
    isString(value.state) &&
    isValidElectionContext(value.election ?? null) &&
    isBallotImportMeta(value.importMeta ?? null) &&
    value.races.every(isValidRace) &&
    value.measures.every(isBallotMeasure)
  );
}

export function isValidCandidateResult(
  value: unknown
): value is CandidateResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.issueBreakdown) ||
    !Array.isArray(value.likes) ||
    !Array.isArray(value.concerns)
  ) {
    return false;
  }

  return (
    isString(value.candidateId) &&
    value.candidateId.trim().length > 0 &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isNullableString(value.party) &&
    isString(value.race) &&
    value.race.trim().length > 0 &&
    isIntegerInRange(value.alignmentScore, 0, 100) &&
    value.issueBreakdown.every(isIssueAlignment) &&
    value.likes.every(isCitedClaim) &&
    value.concerns.every(isCitedClaim) &&
    (value.confidence === "high" ||
      value.confidence === "medium" ||
      value.confidence === "low") &&
    isString(value.reasoning)
  );
}

export function isValidCandidateDossier(
  value: unknown
): value is CandidateDossier {
  if (
    !isRecord(value) ||
    !Array.isArray(value.issueEvidence) ||
    !Array.isArray(value.strengths) ||
    !Array.isArray(value.concerns)
  ) {
    return false;
  }

  return (
    isString(value.name) &&
    value.name.trim().length > 0 &&
    isNullableString(value.party) &&
    isString(value.race) &&
    value.race.trim().length > 0 &&
    isString(value.state) &&
    value.state.trim().length > 0 &&
    isString(value.overview) &&
    value.issueEvidence.every(isDossierIssueNote) &&
    value.strengths.every(isCitedClaim) &&
    value.concerns.every(isCitedClaim) &&
    (value.confidence === "high" ||
      value.confidence === "medium" ||
      value.confidence === "low")
  );
}

export function isValidMeasureResult(value: unknown): value is MeasureResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.prosForVoter) ||
    !Array.isArray(value.consForVoter)
  ) {
    return false;
  }

  return (
    isString(value.measureId) &&
    value.measureId.trim().length > 0 &&
    isString(value.title) &&
    value.title.trim().length > 0 &&
    isString(value.summary) &&
    isIntegerInRange(value.alignmentScore, 0, 100) &&
    value.prosForVoter.every(isCitedClaim) &&
    value.consForVoter.every(isCitedClaim) &&
    (value.recommendation === "yes" ||
      value.recommendation === "no" ||
      value.recommendation === "neutral") &&
    (value.confidence === "high" ||
      value.confidence === "medium" ||
      value.confidence === "low") &&
    isString(value.reasoning)
  );
}

export function isValidMeasureDossier(value: unknown): value is MeasureDossier {
  if (
    !isRecord(value) ||
    !Array.isArray(value.yesCase) ||
    !Array.isArray(value.noCase) ||
    !Array.isArray(value.issueEvidence)
  ) {
    return false;
  }

  return (
    isString(value.title) &&
    value.title.trim().length > 0 &&
    isString(value.state) &&
    value.state.trim().length > 0 &&
    isString(value.summary) &&
    value.yesCase.every(isCitedClaim) &&
    value.noCase.every(isCitedClaim) &&
    value.issueEvidence.every(isDossierIssueNote) &&
    (value.confidence === "high" ||
      value.confidence === "medium" ||
      value.confidence === "low")
  );
}

export function isValidRaceRecommendation(
  value: unknown
): value is RaceRecommendation {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return false;

  return (
    isString(value.raceId) &&
    value.raceId.trim().length > 0 &&
    isString(value.raceName) &&
    value.raceName.trim().length > 0 &&
    value.candidates.every(isValidCandidateResult) &&
    (value.recommendedCandidateId === null ||
      (isString(value.recommendedCandidateId) &&
        value.recommendedCandidateId.trim().length > 0)) &&
    (value.confidence === "high" ||
      value.confidence === "medium" ||
      value.confidence === "low") &&
    isString(value.explanation)
  );
}
