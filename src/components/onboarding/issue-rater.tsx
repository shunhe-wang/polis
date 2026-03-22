"use client";

import { Slider } from "@/components/ui/slider";
import {
  type Issue,
  ISSUES,
  ISSUE_LABELS,
  ISSUE_DESCRIPTIONS,
} from "@/lib/types";

const IMPORTANCE_LABELS: Record<number, string> = {
  1: "Not important",
  2: "Slightly important",
  3: "Moderately important",
  4: "Very important",
  5: "Top priority",
};

interface IssueRaterProps {
  ratings: Record<Issue, number>;
  onRatingChange: (issue: Issue, value: number) => void;
}

export function IssueRater({ ratings, onRatingChange }: IssueRaterProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Rate Your Issues</h2>
      <p className="text-sm text-muted-foreground">
        How important is each issue to you? Slide to set your priority level.
      </p>

      <div className="mt-6 space-y-6">
        {ISSUES.map((issue) => {
          const value = ratings[issue];
          return (
            <div key={issue} className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{ISSUE_LABELS[issue]}</p>
                  <p className="text-xs text-muted-foreground">
                    {ISSUE_DESCRIPTIONS[issue]}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-primary">
                  {IMPORTANCE_LABELS[value]}
                </span>
              </div>
              <Slider
                value={[value]}
                onValueChange={(v) => {
                  const arr = Array.isArray(v) ? v : [v];
                  onRatingChange(issue, arr[0]);
                }}
                min={1}
                max={5}
                step={1}
                className="w-full"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
