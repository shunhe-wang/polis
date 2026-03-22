"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type {
  CandidateStatus,
  MeasureStatus,
} from "@/hooks/useStreamingResearch";

interface ResearchProgressProps {
  statuses: Record<string, CandidateStatus>;
  measureStatuses?: Record<string, MeasureStatus>;
}

export function ResearchProgress({
  statuses,
  measureStatuses,
}: ResearchProgressProps) {
  const candidates = Object.values(statuses);
  const measures = Object.values(measureStatuses ?? {});

  if (candidates.length === 0 && measures.length === 0) return null;

  const totalItems = candidates.length + measures.length;
  const completedItems = [...candidates, ...measures].filter(
    (status) => status.state === "complete" || status.state === "error"
  ).length;
  const progressValue =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-3">
      {totalItems > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Research progress</span>
            <span className="text-muted-foreground">
              {completedItems}/{totalItems}
            </span>
          </div>
          <Progress value={progressValue} />
          <p className="text-xs text-muted-foreground">
            Each item is individually researched with live web sources for accuracy.
            {totalItems > 4
              ? " A full ballot still takes a few minutes, but Polis now shows how many items are finished."
              : ""}
          </p>
        </div>
      )}
      {candidates.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Researching Candidates</h2>
          <div className="space-y-2">
            {candidates.map((status) => (
              <Card
                key={status.candidateId}
                className="border border-black/5 bg-white/72 backdrop-blur-sm dark:border-white/10 dark:bg-white/4"
              >
                <CardContent className="flex items-center gap-3 py-3">
                  <StatusIcon state={status.state} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{status.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {status.race}
                    </p>
                  </div>
                  <StatusLabel state={status.state} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      {measures.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mt-4">
            Researching Ballot Measures
          </h2>
          <div className="space-y-2">
            {measures.map((status) => (
              <Card
                key={status.measureId}
                className="border border-black/5 bg-white/72 backdrop-blur-sm dark:border-white/10 dark:bg-white/4"
              >
                <CardContent className="flex items-center gap-3 py-3">
                  <StatusIcon state={status.state} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{status.title}</p>
                  </div>
                  <StatusLabel state={status.state} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusIcon({ state }: { state: CandidateStatus["state"] }) {
  switch (state) {
    case "researching":
      return (
        <div className="flex size-5 items-center justify-center">
          <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      );
    case "complete":
      return (
        <div className="flex size-5 items-center justify-center text-green-600">
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-5">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      );
    case "error":
      return (
        <div className="flex size-5 items-center justify-center text-destructive">
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-5">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      );
  }
}

function StatusLabel({ state }: { state: CandidateStatus["state"] }) {
  switch (state) {
    case "researching":
      return (
        <span className="text-xs text-muted-foreground">Researching...</span>
      );
    case "complete":
      return <span className="text-xs text-green-600">Complete</span>;
    case "error":
      return <span className="text-xs text-destructive">Failed</span>;
  }
}
