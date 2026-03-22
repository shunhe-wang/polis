import type { BallotInput } from "@/lib/types";

export function updateDraftRaceName(
  draft: BallotInput,
  raceId: string,
  name: string
): BallotInput {
  return {
    ...draft,
    races: draft.races.map((race) =>
      race.id === raceId ? { ...race, name } : race
    ),
  };
}

export function removeDraftRace(
  draft: BallotInput,
  raceId: string
): BallotInput {
  return {
    ...draft,
    races: draft.races.filter((race) => race.id !== raceId),
  };
}

export function updateDraftCandidateName(
  draft: BallotInput,
  raceId: string,
  candidateId: string,
  name: string
): BallotInput {
  return {
    ...draft,
    races: draft.races.map((race) =>
      race.id === raceId
        ? {
            ...race,
            candidates: race.candidates.map((candidate) =>
              candidate.id === candidateId ? { ...candidate, name } : candidate
            ),
          }
        : race
    ),
  };
}

export function updateDraftCandidateParty(
  draft: BallotInput,
  raceId: string,
  candidateId: string,
  party: string
): BallotInput {
  return {
    ...draft,
    races: draft.races.map((race) =>
      race.id === raceId
        ? {
            ...race,
            candidates: race.candidates.map((candidate) =>
              candidate.id === candidateId
                ? { ...candidate, party: party.trim() || null }
                : candidate
            ),
          }
        : race
    ),
  };
}

export function removeDraftCandidate(
  draft: BallotInput,
  raceId: string,
  candidateId: string
): BallotInput {
  return {
    ...draft,
    races: draft.races.map((race) =>
      race.id === raceId
        ? {
            ...race,
            candidates: race.candidates.filter(
              (candidate) => candidate.id !== candidateId
            ),
          }
        : race
    ),
  };
}

export function updateDraftMeasureTitle(
  draft: BallotInput,
  measureId: string,
  title: string
): BallotInput {
  return {
    ...draft,
    measures: draft.measures.map((measure) =>
      measure.id === measureId ? { ...measure, title } : measure
    ),
  };
}

export function updateDraftMeasureDescription(
  draft: BallotInput,
  measureId: string,
  description: string
): BallotInput {
  return {
    ...draft,
    measures: draft.measures.map((measure) =>
      measure.id === measureId ? { ...measure, description } : measure
    ),
  };
}

export function removeDraftMeasure(
  draft: BallotInput,
  measureId: string
): BallotInput {
  return {
    ...draft,
    measures: draft.measures.filter((measure) => measure.id !== measureId),
  };
}
