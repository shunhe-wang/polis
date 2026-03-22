"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ISSUE_LABELS, type CandidateResult } from "@/lib/types";

interface CandidateCardProps {
  result: CandidateResult;
  isRecommended: boolean;
}

export function CandidateCard({ result, isRecommended }: CandidateCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const scoreColor =
    result.alignmentScore >= 70
      ? "text-green-700 bg-green-50 border-green-200"
      : result.alignmentScore >= 40
        ? "text-yellow-700 bg-yellow-50 border-yellow-200"
        : "text-red-700 bg-red-50 border-red-200";

  return (
    <Card className={isRecommended ? "ring-2 ring-primary" : ""}>
      <CardContent className="pt-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{result.name}</h3>
              {isRecommended && (
                <Badge variant="default" className="text-xs">
                  Recommended
                </Badge>
              )}
            </div>
            {result.party && (
              <p className="text-sm text-muted-foreground">{result.party}</p>
            )}
          </div>
          <div
            className={`rounded-lg border px-3 py-1 text-center ${scoreColor}`}
          >
            <p className="text-xl font-bold">{result.alignmentScore}</p>
            <p className="text-[10px] uppercase tracking-wide">Alignment</p>
          </div>
        </div>

        {/* Confidence */}
        <div className="mt-3">
          <Badge variant="secondary" className="text-xs">
            {result.confidence} confidence
          </Badge>
        </div>

        {/* Likes & Concerns */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
              You might like
            </p>
            <ul className="space-y-2">
              {result.likes.map((like, i) => (
                <li key={i} className="text-sm">
                  <p>{like.text}</p>
                  <a
                    href={like.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {like.sourceTitle}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              Potential concerns
            </p>
            <ul className="space-y-2">
              {result.concerns.map((concern, i) => (
                <li key={i} className="text-sm">
                  <p>{concern.text}</p>
                  <a
                    href={concern.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {concern.sourceTitle}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Expand for details */}
        <Separator className="my-4" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full text-xs"
        >
          {showDetails ? "Hide Details" : "How We Decided This"}
        </Button>

        {showDetails && (
          <div className="mt-4 space-y-4">
            {/* Reasoning */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reasoning
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {result.reasoning}
              </p>
            </div>

            {/* Issue Breakdown */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Issue-by-Issue Breakdown
              </p>
              <div className="space-y-3">
                {result.issueBreakdown.map((item) => (
                  <div key={item.issue} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {ISSUE_LABELS[item.issue]}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Priority: {item.userPriority}/5
                        </span>
                        <span className="font-semibold">{item.score}/100</span>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
