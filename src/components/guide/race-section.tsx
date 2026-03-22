"use client";

import { Badge } from "@/components/ui/badge";
import { CandidateCard } from "./candidate-card";
import type { CandidateResult } from "@/lib/types";

interface RaceSectionProps {
  raceName: string;
  candidates: CandidateResult[];
}

export function RaceSection({ raceName, candidates }: RaceSectionProps) {
  // Sort by alignment score descending
  const sorted = [...candidates].sort(
    (a, b) => b.alignmentScore - a.alignmentScore
  );

  const recommended = sorted.length > 0 ? sorted[0] : null;
  const hasStrongRecommendation =
    recommended &&
    recommended.confidence !== "low" &&
    (sorted.length === 1 ||
      recommended.alignmentScore - sorted[1].alignmentScore >= 10);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold">{raceName}</h2>
        {hasStrongRecommendation && (
          <Badge variant="secondary" className="text-xs">
            Clear recommendation
          </Badge>
        )}
      </div>

      {/* Side-by-side comparison bar */}
      {sorted.length > 1 && (
        <div className="flex gap-1 overflow-hidden rounded-lg">
          {sorted.map((c) => {
            const width = Math.max(
              (c.alignmentScore / sorted.reduce((a, b) => a + b.alignmentScore, 0)) * 100,
              15
            );
            return (
              <div
                key={c.candidateId}
                className="flex flex-col items-center justify-center bg-muted px-2 py-2 text-center"
                style={{ width: `${width}%` }}
              >
                <p className="truncate text-xs font-medium">{c.name}</p>
                <p className="text-lg font-bold">{c.alignmentScore}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Candidate cards */}
      <div className="space-y-4">
        {sorted.map((candidate) => (
          <CandidateCard
            key={candidate.candidateId}
            result={candidate}
            isRecommended={
              hasStrongRecommendation === true &&
              candidate.candidateId === recommended?.candidateId
            }
          />
        ))}
      </div>
    </section>
  );
}
