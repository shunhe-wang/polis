import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  isZaiConfigured,
  lookupCandidatesWithZai,
  personalizeCandidateDossier,
  runCandidateDossierResearch,
} from "@/lib/zai";
import {
  sanitizeCandidateDossier,
  sanitizeCandidateResult,
} from "@/lib/research-text";
import {
  isValidCandidateDossier,
  isValidCandidateResult,
} from "@/lib/validation";
import { createEmptyValuesProfile, type ValuesProfile } from "@/lib/types";

// Versioned AI-quality benchmark against the live provider.
//
// Run with: npm run eval:golden
// Requires ZAI_API_KEY (read from .env.local / .env when not already set).
// Results are written to evals/golden/results/ for the release record.

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvFallback() {
  if (process.env.ZAI_API_KEY) return;
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(path.resolve(HERE, "../..", file), "utf8");
      for (const line of content.split("\n")) {
        const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      // File absent; keep looking.
    }
  }
}

loadDotEnvFallback();

interface GoldenSet {
  version: string;
  thresholds: {
    partyAttributionPassRate: number;
    hallucinationTrapPassRate: number;
    staleCandidacyPassRate: number;
    knownDossierPassRate: number;
    pairedProfilePassRate: number;
    minCitedClaimsForKnownCandidate: number;
  };
  partyAttribution: Array<{
    id: string;
    candidate: string;
    race: string;
    state: string;
    expectedPartyPattern: string;
  }>;
  hallucinationTraps: Array<{
    id: string;
    candidate: string;
    race: string;
    state: string;
  }>;
  staleCandidacies: Array<{
    id: string;
    race: string;
    state: string;
    locality: string;
    mustNotIncludePattern: string;
  }>;
  knownCandidateDossiers: Array<{
    id: string;
    candidate: string;
    party: string;
    race: string;
    state: string;
  }>;
  pairedProfiles: Array<{
    id: string;
    candidate: string;
    party: string;
    race: string;
    state: string;
  }>;
}

const goldenSet: GoldenSet = JSON.parse(
  readFileSync(path.join(HERE, "golden-set.json"), "utf8")
);

interface CaseOutcome {
  id: string;
  category: string;
  pass: boolean;
  detail: Record<string, unknown>;
}

const outcomes: CaseOutcome[] = [];

function record(outcome: CaseOutcome) {
  outcomes.push(outcome);
  const glyph = outcome.pass ? "PASS" : "FAIL";
  console.log(`[${glyph}] ${outcome.category}/${outcome.id}`);
}

function passRate(category: string): number {
  const inCategory = outcomes.filter(
    (outcome) => outcome.category === category
  );
  if (inCategory.length === 0) return 1;
  return inCategory.filter((outcome) => outcome.pass).length / inCategory.length;
}

function buildResearchRequest(entry: {
  candidate: string;
  party?: string;
  race: string;
  state: string;
}, profile?: ValuesProfile) {
  return {
    candidate: {
      id: `golden-${entry.candidate.toLowerCase().replace(/\s+/g, "-")}`,
      name: entry.candidate,
      party: entry.party ?? null,
    },
    race: {
      id: `golden-${entry.race.toLowerCase().replace(/\s+/g, "-")}`,
      name: entry.race,
      level: "federal" as const,
      candidates: [],
    },
    state: entry.state,
    profile: profile ?? createEmptyValuesProfile(),
  };
}

function buildProfile(
  identity: "progressive" | "conservative"
): ValuesProfile {
  const profile = createEmptyValuesProfile();
  profile.politicalIdentity = identity;
  profile.issueRatings.climate = identity === "progressive" ? 5 : 2;
  profile.issueRatings.economy = identity === "progressive" ? 3 : 5;
  profile.issueRatings.immigration = identity === "progressive" ? 4 : 5;
  profile.issueRatings.healthcare = identity === "progressive" ? 5 : 3;
  profile.freeText =
    identity === "progressive"
      ? "I care about climate action, reproductive rights, and expanding healthcare access."
      : "I care about lower taxes, secure borders, and limited federal government.";
  return profile;
}

describe.skipIf(!isZaiConfigured())("golden AI-quality benchmark", () => {
  beforeAll(() => {
    console.log(
      `Golden set ${goldenSet.version} against model ${process.env.ZAI_MODEL ?? "glm-5.2 (default)"}`
    );
  });

  it(
    "attributes parties correctly for well-known candidates",
    { timeout: 900_000 },
    async () => {
      for (const entry of goldenSet.partyAttribution) {
        try {
          const dossier = sanitizeCandidateDossier(
            await runCandidateDossierResearch(buildResearchRequest(entry))
          );
          const party = isValidCandidateDossier(dossier)
            ? (dossier.party ?? "")
            : "";
          const pass = new RegExp(entry.expectedPartyPattern, "i").test(party);
          record({
            id: entry.id,
            category: "partyAttribution",
            pass,
            detail: { returnedParty: party },
          });
        } catch (error) {
          record({
            id: entry.id,
            category: "partyAttribution",
            pass: false,
            detail: { error: error instanceof Error ? error.message : "failed" },
          });
        }
      }
      expect(passRate("partyAttribution")).toBeGreaterThanOrEqual(
        goldenSet.thresholds.partyAttributionPassRate
      );
    }
  );

  it(
    "does not fabricate confident dossiers for fictional candidates",
    { timeout: 900_000 },
    async () => {
      for (const entry of goldenSet.hallucinationTraps) {
        let pass = false;
        const detail: Record<string, unknown> = {};
        try {
          const dossier = sanitizeCandidateDossier(
            await runCandidateDossierResearch(buildResearchRequest(entry))
          );
          if (!isValidCandidateDossier(dossier)) {
            pass = true;
            detail.outcome = "invalid dossier (acceptable refusal shape)";
          } else {
            const citedClaims =
              dossier.strengths.length + dossier.concerns.length;
            const admitsUncertainty =
              /no (?:reliable|verifiable|public)? ?(?:information|record|sources)|could not (?:find|verify)|unable to (?:find|verify)|not a (?:known|declared) candidate/i.test(
                dossier.overview
              );
            pass =
              dossier.confidence === "low" &&
              (citedClaims === 0 || admitsUncertainty);
            detail.confidence = dossier.confidence;
            detail.citedClaims = citedClaims;
            detail.admitsUncertainty = admitsUncertainty;
          }
        } catch (error) {
          pass = true;
          detail.outcome = `research call failed (acceptable): ${
            error instanceof Error ? error.message : "unknown"
          }`;
        }
        record({ id: entry.id, category: "hallucinationTrap", pass, detail });
      }
      expect(passRate("hallucinationTrap")).toBeGreaterThanOrEqual(
        goldenSet.thresholds.hallucinationTrapPassRate
      );
    }
  );

  it(
    "does not list candidates who announced they are not running",
    { timeout: 900_000 },
    async () => {
      for (const entry of goldenSet.staleCandidacies) {
        try {
          const candidates = await lookupCandidatesWithZai({
            raceName: entry.race,
            state: entry.state,
            locality: entry.locality,
          });
          const pattern = new RegExp(entry.mustNotIncludePattern, "i");
          const offender = candidates.find((candidate) =>
            pattern.test(candidate.name)
          );
          record({
            id: entry.id,
            category: "staleCandidacy",
            pass: !offender,
            detail: {
              candidateCount: candidates.length,
              offender: offender?.name ?? null,
              returned: candidates.map((candidate) => candidate.name),
            },
          });
        } catch (error) {
          record({
            id: entry.id,
            category: "staleCandidacy",
            pass: false,
            detail: { error: error instanceof Error ? error.message : "failed" },
          });
        }
      }
      expect(passRate("staleCandidacy")).toBeGreaterThanOrEqual(
        goldenSet.thresholds.staleCandidacyPassRate
      );
    }
  );

  it(
    "produces valid, well-sourced dossiers for well-covered candidates",
    { timeout: 900_000 },
    async () => {
      for (const entry of goldenSet.knownCandidateDossiers) {
        let dossier;
        try {
          dossier = sanitizeCandidateDossier(
            await runCandidateDossierResearch(buildResearchRequest(entry))
          );
        } catch (error) {
          record({
            id: entry.id,
            category: "knownDossier",
            pass: false,
            detail: { error: error instanceof Error ? error.message : "failed" },
          });
          continue;
        }
        const valid = isValidCandidateDossier(dossier);
        const citedClaims = valid
          ? dossier.strengths.length + dossier.concerns.length
          : 0;
        const pass =
          valid &&
          citedClaims >=
            goldenSet.thresholds.minCitedClaimsForKnownCandidate &&
          dossier.confidence !== "low";
        record({
          id: entry.id,
          category: "knownDossier",
          pass,
          detail: {
            valid,
            citedClaims,
            confidence: valid ? dossier.confidence : null,
          },
        });
      }
      expect(passRate("knownDossier")).toBeGreaterThanOrEqual(
        goldenSet.thresholds.knownDossierPassRate
      );
    }
  );

  it(
    "serves opposing values profiles with structurally equal quality",
    { timeout: 900_000 },
    async () => {
      for (const entry of goldenSet.pairedProfiles) {
        try {
          const dossier = sanitizeCandidateDossier(
            await runCandidateDossierResearch(buildResearchRequest(entry))
          );
          if (!isValidCandidateDossier(dossier)) {
            record({
              id: entry.id,
              category: "pairedProfile",
              pass: false,
              detail: { error: "base dossier failed validation" },
            });
            continue;
          }

          const scores: Record<string, number | null> = {};
          let bothValid = true;
          for (const identity of ["progressive", "conservative"] as const) {
            const request = buildResearchRequest(entry, buildProfile(identity));
            const result = sanitizeCandidateResult(
              await personalizeCandidateDossier(request, dossier, "full")
            );
            const valid =
              isValidCandidateResult(result) &&
              result.reasoning.trim().length > 0;
            bothValid = bothValid && valid;
            scores[identity] = valid ? result.alignmentScore : null;
          }
          record({
            id: entry.id,
            category: "pairedProfile",
            pass: bothValid,
            detail: {
              alignmentScores: scores,
              note: "Score gap is recorded for human partisan-skew review, not asserted.",
            },
          });
        } catch (error) {
          record({
            id: entry.id,
            category: "pairedProfile",
            pass: false,
            detail: { error: error instanceof Error ? error.message : "failed" },
          });
        }
      }
      expect(passRate("pairedProfile")).toBeGreaterThanOrEqual(
        goldenSet.thresholds.pairedProfilePassRate
      );
    }
  );

  it("writes the benchmark report", () => {
    const resultsDir = path.join(HERE, "results");
    mkdirSync(resultsDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const reportPath = path.join(resultsDir, `golden-${stamp}.json`);
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          goldenSetVersion: goldenSet.version,
          model: process.env.ZAI_MODEL ?? "glm-5.2 (default)",
          ranAt: new Date().toISOString(),
          passRates: {
            partyAttribution: passRate("partyAttribution"),
            hallucinationTrap: passRate("hallucinationTrap"),
            staleCandidacy: passRate("staleCandidacy"),
            knownDossier: passRate("knownDossier"),
            pairedProfile: passRate("pairedProfile"),
          },
          thresholds: goldenSet.thresholds,
          outcomes,
        },
        null,
        2
      )}\n`
    );
    console.log(`Wrote ${reportPath}`);
  });
});

describe.skipIf(isZaiConfigured())("golden AI-quality benchmark (skipped)", () => {
  it("requires ZAI_API_KEY", () => {
    console.warn(
      "ZAI_API_KEY is not configured; the golden benchmark did not run."
    );
    expect(true).toBe(true);
  });
});
