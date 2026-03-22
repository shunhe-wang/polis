"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CandidateCard } from "@/components/guide/candidate-card";
import { CollapsibleContent } from "@/components/guide/collapsible-content";
import { buildCandidateSourceLinks } from "@/lib/candidate-links";
import type {
  BallotInput,
  Candidate,
  CandidateResult,
  Race,
} from "@/lib/types";
import type { UserTier } from "@/lib/freemium";
import { useState } from "react";

interface FreeGuideBrowserProps {
  ballotInput: BallotInput;
  userTier: UserTier;
  trustedAccount: boolean;
  trustReason: string | null;
  starterAnalysesRemaining: number;
  starterResult: CandidateResult | null;
  starterError: string | null;
  analyzingCandidateId: string | null;
  onAnalyzeCandidate: (candidate: Candidate, race: Race) => void;
  onSignUp: () => void;
  onSignIn: () => void;
  onEditBallot: () => void;
}

export function FreeGuideBrowser({
  ballotInput,
  userTier,
  trustedAccount,
  trustReason,
  starterAnalysesRemaining,
  starterResult,
  starterError,
  analyzingCandidateId,
  onAnalyzeCandidate,
  onSignUp,
  onSignIn,
  onEditBallot,
}: FreeGuideBrowserProps) {
  const [collapsedRaceIds, setCollapsedRaceIds] = useState<string[]>([]);
  const [measuresCollapsed, setMeasuresCollapsed] = useState(false);
  const planHeading = userTier === "pro" ? "Ballot Browser" : "Free Plan";
  const starterPlanCopy =
    userTier === "guest"
      ? "Browse your ballot, open source links for each candidate, and create a free account to unlock 1 starter candidate analysis."
      : userTier === "pro"
        ? "This ballot is not unlocked yet. Browse candidate links first, then spend a pass only when you want the full personalized guide."
      : !trustedAccount
        ? trustReason ??
          "Verify your email with a real inbox before starter analysis or paid passes will work."
      : starterAnalysesRemaining > 0
        ? `Browse your ballot, open source links for each candidate, and unlock ${starterAnalysesRemaining} free starter candidate analysis${starterAnalysesRemaining === 1 ? "" : "es"}.`
        : "Browse your ballot and open source links for each candidate. Your free starter candidate analysis has already been used.";

  return (
    <div className="space-y-8">
      <Card className="border-primary/15 bg-white/65 shadow-[0_25px_70px_-40px_rgba(8,47,73,0.45)] backdrop-blur-sm dark:bg-white/5">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{planHeading}</h2>
              <p className="text-sm text-muted-foreground">
                {starterPlanCopy}
              </p>
              <p className="text-sm text-muted-foreground">
                {userTier === "pro"
                  ? "Full personalized ballot research, measure analysis, and sharing start only after you unlock this ballot."
                  : "Full personalized ballot research, measure analysis, and sharing unlock with a paid pass."}
              </p>
              {!trustedAccount && userTier !== "guest" && (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Starter analysis and checkout stay locked until this account uses a verified, non-disposable email.
                </p>
              )}
            </div>
            {userTier === "guest" && (
              <div className="flex flex-col gap-2 sm:min-w-40">
                <Button onClick={onSignUp}>Sign Up Free</Button>
                <Button variant="outline" onClick={onSignIn}>
                  Sign In
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {starterError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Starter analysis unavailable</p>
          <p className="mt-1">{starterError}</p>
        </div>
      )}

      {ballotInput.races.map((race) => (
        <section
          key={race.id}
          className="rounded-[1.75rem] border border-black/5 bg-white/72 p-4 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{race.name}</h2>
                <Badge variant="secondary" className="text-xs">
                  {race.candidates.length} candidate
                  {race.candidates.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Browse source links first, then use your starter analysis on the
                candidate you care about most.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCollapsedRaceIds((current) =>
                  current.includes(race.id)
                    ? current.filter((id) => id !== race.id)
                    : [...current, race.id]
                )
              }
              className="rounded-full"
            >
              {collapsedRaceIds.includes(race.id) ? (
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

          <CollapsibleContent open={!collapsedRaceIds.includes(race.id)}>
            <div className="space-y-3">
            {race.candidates.map((candidate) => {
              const isUnlockedCandidate =
                starterResult?.candidateId === candidate.id;
              const sourceLinks = buildCandidateSourceLinks(
                candidate,
                race.name,
                ballotInput.state
              );

              return (
                <Card key={candidate.id}>
                  <CardContent className="pt-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-base font-semibold">
                            {candidate.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {candidate.party ?? "Party not listed"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {sourceLinks.map((link) => (
                            <a
                              key={link.label}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {userTier === "guest" ? (
                          <>
                            <Button size="sm" onClick={onSignUp}>
                              Unlock 1 Free Analysis
                            </Button>
                            <Button size="sm" variant="outline" onClick={onSignIn}>
                              Already have an account?
                            </Button>
                          </>
                        ) : userTier === "pro" ? (
                          <Button size="sm" variant="outline" disabled>
                            Unlock this ballot above for full analysis
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={isUnlockedCandidate ? "outline" : "default"}
                            disabled={
                              analyzingCandidateId !== null ||
                              !trustedAccount ||
                              (!isUnlockedCandidate &&
                                starterAnalysesRemaining <= 0)
                            }
                            onClick={() => onAnalyzeCandidate(candidate, race)}
                          >
                            {analyzingCandidateId === candidate.id
                              ? "Analyzing..."
                              : !trustedAccount
                                ? "Verify Email First"
                              : isUnlockedCandidate
                                ? "Starter Analysis Unlocked"
                                : starterAnalysesRemaining > 0
                                  ? "Use Free Analysis"
                                  : "Free Analysis Used"}
                          </Button>
                        )}
                      </div>

                      {isUnlockedCandidate && starterResult && (
                        <CandidateCard
                          result={starterResult}
                          isRecommended={false}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          </CollapsibleContent>
        </section>
      ))}

      {ballotInput.measures.length > 0 && (
        <section className="space-y-3 rounded-[1.75rem] border border-black/5 bg-white/72 p-4 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Ballot Measures</h2>
              <Badge variant="secondary" className="text-xs">
                Paid Pass
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMeasuresCollapsed((current) => !current)}
              className="rounded-full"
            >
              {measuresCollapsed ? (
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
          <CollapsibleContent open={!measuresCollapsed}>
          <div className="space-y-3">
            {ballotInput.measures.map((measure) => (
              <Card key={measure.id}>
                <CardContent className="pt-4">
                  <h3 className="text-sm font-semibold">{measure.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {measure.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          </CollapsibleContent>
        </section>
      )}

      <div className="flex justify-between border-t border-black/5 pt-4 dark:border-white/10">
        <Button variant="ghost" onClick={onEditBallot} className="rounded-full">
          Edit Ballot
        </Button>
      </div>
    </div>
  );
}
