"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CandidateCard } from "./candidate-card";
import { CollapsibleContent } from "./collapsible-content";
import type { CandidateResult } from "@/lib/types";
import { rankRaceCandidates } from "@/lib/race-recommendations";

interface RaceSectionProps {
  sectionId?: string;
  raceName: string;
  candidates: CandidateResult[];
  compactMode?: boolean;
}

export function RaceSection({
  sectionId,
  raceName,
  candidates,
  compactMode = false,
}: RaceSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(compactMode);
  const {
    sortedCandidates: sorted,
    recommended,
    runnerUp,
    hasCloseCall,
    explanation,
  } = rankRaceCandidates(candidates);
  const hasStrongRecommendation =
    recommended &&
    recommended.confidence !== "low" &&
    (sorted.length === 1 ||
      recommended.alignmentScore - sorted[1].alignmentScore >= 10);

  return (
    <section
      id={sectionId}
      className="scroll-mt-28 rounded-[1.75rem] border border-black/5 bg-white/70 p-4 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{raceName}</h2>
            {hasStrongRecommendation && (
              <Badge variant="secondary" className="text-xs">
                Clear recommendation
              </Badge>
            )}
            {hasCloseCall && sorted.length > 1 && (
              <Badge variant="outline" className="text-xs">
                Close call
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {sorted.length} candidate{sorted.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {sorted.slice(0, 3).map((candidate) => (
              <span
                key={candidate.candidateId}
                className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1"
              >
                <span className="font-medium text-foreground/85">
                  {candidate.name}
                </span>
                <span>{candidate.alignmentScore}</span>
              </span>
            ))}
          </div>
          {recommended && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              Top match right now:{" "}
              <span className="font-medium text-foreground">
                {recommended.name}
              </span>{" "}
              at {recommended.alignmentScore}/100.
              {runnerUp && hasCloseCall
                ? ` ${explanation}`
                : recommended.reasoning
                  ? ` ${recommended.reasoning.split("\n")[0]}`
                  : ""}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCollapsed((current) => !current)}
          className="shrink-0 rounded-full"
        >
          {isCollapsed ? (
            <>
              <ChevronDown />
              Expand
            </>
          ) : (
            <>
              <ChevronUp />
              Collapse
            </>
          )}
        </Button>
      </div>

      {/* Side-by-side comparison bar */}
      <CollapsibleContent open={!isCollapsed}>
        {sorted.length > 1 && (
        <div className="flex gap-1 overflow-hidden rounded-2xl border border-black/5 bg-background/70 p-1 dark:border-white/10">
          {sorted.map((c) => {
            const width = Math.max(
              (c.alignmentScore / sorted.reduce((a, b) => a + b.alignmentScore, 0)) * 100,
              15
            );
            return (
              <div
                key={c.candidateId}
                className="flex flex-col items-center justify-center rounded-xl bg-muted px-2 py-3 text-center"
                style={{ width: `${width}%` }}
              >
                <p className="truncate text-xs font-medium">{c.name}</p>
                <p className="text-lg font-bold">{c.alignmentScore}</p>
              </div>
            );
          })}
        </div>
        )}

        <div className={sorted.length > 1 ? "mt-4 space-y-4" : "space-y-4"}>
          {sorted.map((candidate) => (
            <CandidateCard
              key={candidate.candidateId}
              result={candidate}
              raceName={raceName}
              isRecommended={
                hasStrongRecommendation === true &&
                candidate.candidateId === recommended?.candidateId
              }
            />
          ))}
        </div>
      </CollapsibleContent>
    </section>
  );
}
