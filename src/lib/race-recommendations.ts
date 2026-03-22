import type { CandidateResult, Issue, RaceRecommendation } from "@/lib/types";

const CONFIDENCE_RANK: Record<CandidateResult["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function weightedIssueScore(candidate: CandidateResult): number {
  const totalWeight = candidate.issueBreakdown.reduce(
    (sum, issue) => sum + issue.userPriority,
    0
  );
  if (totalWeight === 0) return candidate.alignmentScore;

  const weightedTotal = candidate.issueBreakdown.reduce(
    (sum, issue) => sum + issue.score * issue.userPriority,
    0
  );

  return weightedTotal / totalWeight;
}

function compareCandidates(a: CandidateResult, b: CandidateResult): number {
  if (b.alignmentScore !== a.alignmentScore) {
    return b.alignmentScore - a.alignmentScore;
  }

  const confidenceDelta =
    CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  const weightedDelta = weightedIssueScore(b) - weightedIssueScore(a);
  if (Math.abs(weightedDelta) > 0.001) {
    return weightedDelta > 0 ? 1 : -1;
  }

  return a.name.localeCompare(b.name);
}

function findTopPriorityEdge(
  winner: CandidateResult,
  runnerUp: CandidateResult
): string | null {
  const winnerIssues = new Map(
    winner.issueBreakdown.map((issue) => [issue.issue, issue])
  );

  const bestEdge = runnerUp.issueBreakdown
    .map((issue) => {
      const matching = winnerIssues.get(issue.issue);
      if (!matching) return null;
      return {
        issue: matching.issue,
        priority: matching.userPriority,
        scoreDelta: matching.score - issue.score,
      };
    })
    .filter(
      (
        value
      ): value is { issue: Issue; priority: number; scoreDelta: number } =>
        value !== null
    )
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.scoreDelta - a.scoreDelta;
    })
    .find((issue) => issue.scoreDelta > 0);

  if (!bestEdge) return null;

  return bestEdge.issue.replace(/_/g, " ");
}

export interface RankedRaceRecommendation {
  sortedCandidates: CandidateResult[];
  recommended: CandidateResult | null;
  runnerUp: CandidateResult | null;
  hasCloseCall: boolean;
  explanation: string;
}

export function rankRaceCandidates(
  candidates: CandidateResult[]
): RankedRaceRecommendation {
  const sortedCandidates = [...candidates].sort(compareCandidates);
  const recommended = sortedCandidates[0] ?? null;
  const runnerUp = sortedCandidates[1] ?? null;

  if (!recommended) {
    return {
      sortedCandidates,
      recommended: null,
      runnerUp: null,
      hasCloseCall: false,
      explanation: "",
    };
  }

  if (!runnerUp) {
    return {
      sortedCandidates,
      recommended,
      runnerUp: null,
      hasCloseCall: false,
      explanation: `${recommended.name} is the only researched candidate in this race.`,
    };
  }

  const scoreDelta = recommended.alignmentScore - runnerUp.alignmentScore;
  const sameHeadlineScore = scoreDelta === 0;
  const closeCall = sameHeadlineScore || scoreDelta <= 3;
  const issueEdge = findTopPriorityEdge(recommended, runnerUp);

  let explanation: string;
  if (sameHeadlineScore) {
    explanation = `${recommended.name} gets the nod over ${runnerUp.name} in a very close call. They share the same headline alignment score, but ${recommended.name} comes out slightly ahead on your highest-priority issues${issueEdge ? `, especially ${issueEdge}` : ""}.`;
  } else if (closeCall) {
    explanation = `${recommended.name} is the recommendation, but ${runnerUp.name} is very close behind. ${recommended.name} has the stronger overall fit${issueEdge ? `, with a clearer edge on ${issueEdge}` : ""}.`;
  } else {
    explanation = `${recommended.name} is the strongest overall match in this race.${issueEdge ? ` The clearest edge is on ${issueEdge}.` : ""}`;
  }

  return {
    sortedCandidates,
    recommended,
    runnerUp,
    hasCloseCall: closeCall,
    explanation,
  };
}

export function buildRaceRecommendation(input: {
  raceId: string;
  raceName: string;
  candidates: CandidateResult[];
}): RaceRecommendation {
  const ranked = rankRaceCandidates(input.candidates);

  return {
    raceId: input.raceId,
    raceName: input.raceName,
    candidates: ranked.sortedCandidates,
    recommendedCandidateId: ranked.recommended?.candidateId ?? null,
    confidence: ranked.recommended?.confidence ?? "low",
    explanation: ranked.explanation,
  };
}
