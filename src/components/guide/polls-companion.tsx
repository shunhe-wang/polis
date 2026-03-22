"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CandidateResult, MeasureResult } from "@/lib/types";
import { formatPartyInline } from "@/lib/party-format";

interface PollsRaceItem {
  id: string;
  raceName: string;
  recommended: CandidateResult | null;
  runnerUp: CandidateResult | null;
  explanation: string;
  hasCloseCall: boolean;
}

interface PollsCompanionProps {
  heading: string;
  subheading?: string | null;
  races: PollsRaceItem[];
  measures: MeasureResult[];
  onExit: () => void;
}

function getMeasureLabel(result: MeasureResult): string {
  if (result.recommendation === "yes") return "Vote YES";
  if (result.recommendation === "no") return "Vote NO";
  return "Neutral";
}

export function PollsCompanion({
  heading,
  subheading,
  races,
  measures,
  onExit,
}: PollsCompanionProps) {
  return (
    <div className="space-y-6">
      <div className="sticky top-3 z-20 rounded-[1.5rem] border border-black/10 bg-white/95 p-4 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/95">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Take To Polls
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">{heading}</h2>
            {subheading && (
              <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              Large text
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              Quick reference
            </Badge>
            <Button variant="outline" onClick={onExit}>
              Back to Full Guide
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {races.map((race) => (
          <section
            key={race.id}
            className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Race
                  </p>
                  <h3 className="mt-1 text-xl font-bold leading-tight">
                    {race.raceName}
                  </h3>
                </div>
                {race.hasCloseCall && (
                  <Badge variant="outline" className="rounded-full text-xs">
                    Close call
                  </Badge>
                )}
              </div>

              {race.recommended ? (
                <>
                  <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                      Recommended Pick
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {race.recommended.name}
                      {race.recommended.party && (
                        <span className="ml-2 text-lg font-semibold text-slate-500 dark:text-slate-400">
                          {formatPartyInline(race.recommended.party)}
                        </span>
                      )}
                    </p>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      {race.explanation}
                    </p>
                  </div>

                  {race.runnerUp && (
                    <div className="rounded-[1.25rem] border border-black/5 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Also Worth Knowing
                      </p>
                      <p className="mt-2 text-lg font-semibold">
                        {race.runnerUp.name}
                        {race.runnerUp.party && (
                          <span className="ml-2 text-base font-medium text-slate-500 dark:text-slate-400">
                            {formatPartyInline(race.runnerUp.party)}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                  Polis did not have enough information to make a confident pick
                  in this race.
                </div>
              )}
            </div>
          </section>
        ))}

        {measures.length > 0 && (
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Ballot Measures
                </p>
                <h3 className="mt-1 text-xl font-bold tracking-tight">
                  Quick Measure Picks
                </h3>
              </div>
              {measures.map((measure) => (
                <div
                  key={measure.measureId}
                  className="rounded-[1.25rem] border border-black/5 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <h4 className="text-lg font-semibold leading-tight">
                        {measure.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {measure.summary}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="rounded-full px-3 py-1 text-sm"
                    >
                      {getMeasureLabel(measure)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
