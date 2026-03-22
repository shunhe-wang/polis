"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MeasureResult } from "@/lib/types";

interface MeasureCardProps {
  result: MeasureResult;
}

export function MeasureCard({ result }: MeasureCardProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  const recColor =
    result.recommendation === "yes"
      ? "bg-green-100 text-green-800"
      : result.recommendation === "no"
        ? "bg-red-100 text-red-800"
        : "bg-yellow-100 text-yellow-800";

  const recLabel =
    result.recommendation === "yes"
      ? "Vote YES"
      : result.recommendation === "no"
        ? "Vote NO"
        : "Neutral";

  return (
    <Card className="border border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h4 className="text-sm font-semibold">{result.title}</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.summary}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-green-200 bg-green-50 text-lg font-bold text-green-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              {result.alignmentScore}
            </div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Alignment
            </span>
          </div>
        </div>

        <div className="mt-3">
          <Badge variant="secondary" className={recColor}>
            {recLabel}
          </Badge>
          <Badge variant="secondary" className="ml-2">
            {result.confidence} confidence
          </Badge>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Pros */}
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Reasons to Vote Yes
            </h5>
            <ul className="mt-2 space-y-2">
              {result.prosForVoter.map((pro, i) => (
                <li key={i} className="text-sm">
                  {pro.text}
                  {pro.sourceUrl && (
                    <a
                      href={pro.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-xs text-blue-600 underline underline-offset-2"
                    >
                      {pro.sourceTitle || "Source"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Cons */}
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-red-700">
              Reasons to Vote No
            </h5>
            <ul className="mt-2 space-y-2">
              {result.consForVoter.map((con, i) => (
                <li key={i} className="text-sm">
                  {con.text}
                  {con.sourceUrl && (
                    <a
                      href={con.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-xs text-blue-600 underline underline-offset-2"
                    >
                      {con.sourceTitle || "Source"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Reasoning toggle */}
        <div className="mt-4">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {showReasoning
              ? "Hide Analysis"
              : "How We Decided This"}
          </button>
          {showReasoning && (
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
              {result.reasoning}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
