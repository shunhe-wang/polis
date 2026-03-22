"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ADVANCED_ISSUES,
  CORE_ISSUES,
  type Issue,
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  function renderIssue(issue: Issue) {
    const value = ratings[issue];

    return (
      <div
        key={issue}
        className="space-y-3 rounded-xl border bg-muted/20 p-4"
      >
        <div className="space-y-1">
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
        </div>

        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((option) => (
            <Button
              key={option}
              type="button"
              variant={value === option ? "default" : "outline"}
              size="sm"
              className="h-auto flex-col gap-1 px-2 py-2 text-center"
              onClick={() => onRatingChange(issue, option)}
            >
              <span className="text-sm font-semibold">{option}</span>
              <span className="text-[10px] leading-tight whitespace-normal">
                {IMPORTANCE_LABELS[option]}
              </span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Rate Your Issues</h2>
      <p className="text-sm text-muted-foreground">
        Rate how important each issue is to you. The core issues are up front;
        less common topics stay available below.
      </p>

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-5 gap-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
        </div>

        {CORE_ISSUES.map(renderIssue)}

        <div className="rounded-xl border border-dashed p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Additional Issues</p>
              <p className="text-xs text-muted-foreground">
                Civil liberties, foreign policy, and crypto/tech regulation.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              {showAdvanced ? "Hide" : "Show"}
            </Button>
          </div>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              {ADVANCED_ISSUES.map(renderIssue)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
