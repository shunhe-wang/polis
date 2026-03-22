import Anthropic from "@anthropic-ai/sdk";
import type {
  BallotReviewDraft,
  ValuesProfile,
  Race,
  Candidate,
  BallotMeasure,
  CandidateDossier,
  CandidateResult,
  Issue,
  MeasureDossier,
  MeasureResult,
  PolicySignal,
} from "./types";
import {
  ISSUE_LABELS,
  POLICY_SIGNALS,
  POLICY_SIGNAL_CHOICE_LABELS,
  POLICY_SIGNAL_LABELS,
} from "./types";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a non-partisan political research assistant. Your job is to research candidates running for office and evaluate how well their positions align with a voter's stated values and priorities.

Rules:
1. Be factual and cite sources for every claim. Include URLs where possible.
2. Never express your own political opinions or endorse any candidate.
3. Present both strengths and concerns from the voter's perspective.
4. If you cannot find reliable information about a candidate, say so clearly rather than speculating.
5. Score alignment honestly — a 50 means neutral/unknown, not a default.
6. Weight the alignment score by the voter's issue priority ratings (1-5). Issues rated 5 should matter much more than issues rated 1.
7. Do not include XML/HTML tags, inline citation markers, or bracketed citation references in any text field.
8. Keep prose concise and concrete.
9. Return ONLY valid JSON — no markdown fences, no commentary before or after.`;

function formatIssueRatings(ratings: Record<Issue, number>): string {
  return Object.entries(ratings)
    .map(([issue, rating]) => `- ${ISSUE_LABELS[issue as Issue]}: ${rating}/5`)
    .join("\n");
}

function formatPolicySignals(profile: ValuesProfile): string {
  const lines = POLICY_SIGNALS.flatMap((signal) => {
    const value = profile.policySignals[signal];
    if (!value) return [];

    return [
      `- ${POLICY_SIGNAL_LABELS[signal]}: ${getPolicySignalChoiceLabel(signal, value)}`,
    ];
  });

  return lines.length > 0
    ? lines.join("\n")
    : "- No specific directional policy leanings provided.";
}

function getPolicySignalChoiceLabel(
  signal: PolicySignal,
  value: string
): string {
  return (
    POLICY_SIGNAL_CHOICE_LABELS[signal][
      value as keyof (typeof POLICY_SIGNAL_CHOICE_LABELS)[typeof signal]
    ] ?? value
  );
}

function buildUserPrompt(
  candidate: Candidate,
  race: Race,
  state: string,
  profile: ValuesProfile,
  dossier: CandidateDossier,
  mode: "full" | "starter" = "full"
): string {
  const starterInstructions =
    mode === "starter"
      ? "\nStarter mode: keep the reasoning to one short paragraph, keep source-backed likes and concerns to 2 items each, and focus on the clearest factors a voter would care about."
      : "\nFull mode: keep the reasoning to 1-2 short paragraphs and keep every bullet concise.";

  return `Use the dossier below to evaluate how well this candidate aligns with my values profile.

## Candidate
- Name: ${candidate.name}
- Race: ${race.name}
- Party: ${candidate.party ?? "Unknown"}
- Location: ${state}

## My Values Profile
### Issue Priorities (1=not important, 5=top priority)
${formatIssueRatings(profile.issueRatings)}

### Directional policy leanings
${formatPolicySignals(profile)}

### What matters most to me
${profile.freeText || "No additional context provided."}

### Political identity
${profile.politicalIdentity ?? "Not specified"}

## Neutral Candidate Dossier
${JSON.stringify(dossier, null, 2)}

## Instructions
Do not do fresh web research. Use only the dossier above and synthesize a personalized recommendation as a JSON object with this exact structure:

{
  "candidateId": "${candidate.id}",
  "name": "${candidate.name}",
  "party": ${candidate.party ? `"${candidate.party}"` : "null"},
  "race": "${race.name}",
  "alignmentScore": <number 0-100>,
  "issueBreakdown": [
    {
      "issue": "<issue key from: economy, healthcare, climate, immigration, housing, civil_liberties, foreign_policy, education, crypto_tech>",
      "score": <number 0-100>,
      "summary": "<1 short sentence alignment summary>",
      "candidatePosition": "<what the candidate's position is>",
      "userPriority": <1-5 from profile>
    }
  ],
  "likes": [
    {
      "text": "<something the voter might like>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "concerns": [
    {
      "text": "<a potential concern for this voter>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "confidence": "<high|medium|low based on how much info you found>",
  "reasoning": "<1-2 short paragraphs explaining the key alignment factors>"
}

Keep every likes and concerns item to one sentence. Include 2 concise items each for "likes" and "concerns". Include an issueBreakdown entry for each of the 9 issues. Return ONLY the JSON object.${starterInstructions}`;
}

function buildMeasurePrompt(
  measure: BallotMeasure,
  state: string,
  profile: ValuesProfile,
  dossier: MeasureDossier
): string {
  return `Use the dossier below to evaluate how this ballot measure aligns with my values profile.

## Ballot Measure
- Title: ${measure.title}
- Type: ${measure.type}
- Location: ${state}
- Description: ${measure.description}

## My Values Profile
### Issue Priorities (1=not important, 5=top priority)
${formatIssueRatings(profile.issueRatings)}

### Directional policy leanings
${formatPolicySignals(profile)}

### What matters most to me
${profile.freeText || "No additional context provided."}

### Political identity
${profile.politicalIdentity ?? "Not specified"}

## Neutral Measure Dossier
${JSON.stringify(dossier, null, 2)}

## Instructions
Do not do fresh web research. Use only the dossier above and provide your analysis as a JSON object with this exact structure:

{
  "measureId": "${measure.id}",
  "title": "${measure.title}",
  "summary": "<plain-language 1-2 sentence explanation of what this measure does>",
  "alignmentScore": <number 0-100, how well voting YES aligns with this voter's values>,
  "prosForVoter": [
    {
      "text": "<a reason this voter might support it>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "consForVoter": [
    {
      "text": "<a reason this voter might oppose it>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "recommendation": "<yes|no|neutral>",
  "confidence": "<high|medium|low based on how much info you found>",
  "reasoning": "<1-2 short paragraphs explaining the measure and its alignment with this voter's values>"
}

Keep every prosForVoter and consForVoter item to one sentence. Include 2 concise items each for "prosForVoter" and "consForVoter". Return ONLY the JSON object.`;
}

export interface ResearchRequest {
  candidate: Candidate;
  race: Race;
  state: string;
  profile: ValuesProfile;
}

export interface MeasureResearchRequest {
  measure: BallotMeasure;
  state: string;
  profile: ValuesProfile;
}

function buildBallotTextParsePrompt(input: {
  ballotText: string;
  state: string | null;
}): string {
  return `Parse the pasted ballot text below into a clean ballot draft.

## Context
- State: ${input.state ?? "Unknown"}

## Instructions
Use only the pasted text. Do not do web research. Extract the likely election info, candidate races, and ballot measures. Return ONLY valid JSON with this exact structure:

{
  "election": {
    "name": "<string or null>",
    "electionDay": "<YYYY-MM-DD string or null>",
    "kind": "<primary|general|special|other|null>",
    "selectedParty": "<string or null>"
  },
  "races": [
    {
      "name": "<race title>",
      "level": "<federal|state|local>",
      "contestType": "<string or null>",
      "candidates": [
        {
          "name": "<candidate name>",
          "party": "<string or null>"
        }
      ]
    }
  ],
  "measures": [
    {
      "title": "<measure title>",
      "description": "<plain-language description from the pasted text>",
      "type": "<referendum|initiative|amendment|other>"
    }
  ],
  "confidence": <integer 0-100>,
  "notes": [
    "<short note about ambiguities, OCR issues, or anything the user should verify>"
  ]
}

Rules:
- Prefer omission over guessing.
- If party is not clearly stated, use null.
- If the election date is unclear, use null.
- Keep notes short and concrete.
- Keep measure descriptions concise.

## Pasted Ballot Text
${input.ballotText}`;
}

function buildBallotFileParsePrompt(input: {
  state: string | null;
  fileName: string;
}): string {
  return `Parse the uploaded ballot file into a clean ballot draft.

## Context
- State: ${input.state ?? "Unknown"}
- File name: ${input.fileName}

## Instructions
Use only the uploaded ballot file. Do not do web research. Extract the likely election info, candidate races, and ballot measures. Return ONLY valid JSON with this exact structure:

{
  "election": {
    "name": "<string or null>",
    "electionDay": "<YYYY-MM-DD string or null>",
    "kind": "<primary|general|special|other|null>",
    "selectedParty": "<string or null>"
  },
  "races": [
    {
      "name": "<race title>",
      "level": "<federal|state|local>",
      "contestType": "<string or null>",
      "candidates": [
        {
          "name": "<candidate name>",
          "party": "<string or null>"
        }
      ]
    }
  ],
  "measures": [
    {
      "title": "<measure title>",
      "description": "<plain-language description from the ballot>",
      "type": "<referendum|initiative|amendment|other>"
    }
  ],
  "confidence": <integer 0-100>,
  "notes": [
    "<short note about ambiguities, OCR issues, or anything the user should verify>"
  ]
}

Rules:
- Prefer omission over guessing.
- If party is not clearly stated, use null.
- If the election date is unclear, use null.
- Keep notes short and concrete.
- Keep measure descriptions concise.
- Preserve the ballot's jurisdiction-specific race names.`;
}

function buildCandidateDossierPrompt(
  candidate: Candidate,
  race: Race,
  state: string
): string {
  return `Research this candidate and produce a neutral dossier.

## Candidate
- Name: ${candidate.name}
- Race: ${race.name}
- Party: ${candidate.party ?? "Unknown"}
- Location: ${state}

## Instructions
Search the web for recent, credible information about the candidate's platform, record, public statements, endorsements, and major points of criticism. Then return ONLY valid JSON with this exact structure:

{
  "name": "${candidate.name}",
  "party": ${candidate.party ? `"${candidate.party}"` : "null"},
  "race": "${race.name}",
  "state": "${state}",
  "overview": "<2-3 sentence neutral summary of who this candidate is and what they emphasize>",
  "issueEvidence": [
    {
      "issue": "<issue key from: economy, healthcare, climate, immigration, housing, civil_liberties, foreign_policy, education, crypto_tech>",
      "summary": "<1 short sentence on what the candidate appears to support or oppose>",
      "stance": "<quote-free plain-language description of the candidate's position or lack of clarity>"
    }
  ],
  "strengths": [
    {
      "text": "<1 short source-backed point in the candidate's favor>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "concerns": [
    {
      "text": "<1 short source-backed concern or criticism>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "confidence": "<high|medium|low>"
}

Keep the overview concise. Include all 9 issues in issueEvidence, using unknown/unclear language when information is thin. Include 2 concise items each for strengths and concerns. Return ONLY the JSON object.`;
}

function buildMeasureDossierPrompt(
  measure: BallotMeasure,
  state: string
): string {
  return `Research this ballot measure and produce a neutral dossier.

## Ballot Measure
- Title: ${measure.title}
- Type: ${measure.type}
- Location: ${state}
- Description: ${measure.description}

## Instructions
Search the web for credible information about what this measure would do, who supports it, who opposes it, and its likely practical impact. Then return ONLY valid JSON with this exact structure:

{
  "title": "${measure.title}",
  "state": "${state}",
  "summary": "<2-3 sentence neutral explanation of what the measure does>",
  "yesCase": [
    {
      "text": "<1 short source-backed argument from supporters>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "noCase": [
    {
      "text": "<1 short source-backed argument from opponents>",
      "sourceUrl": "<url>",
      "sourceTitle": "<source name>"
    }
  ],
  "issueEvidence": [
    {
      "issue": "<issue key from: economy, healthcare, climate, immigration, housing, civil_liberties, foreign_policy, education, crypto_tech>",
      "summary": "<1 short sentence about how the measure could affect this issue>",
      "stance": "<plain-language explanation of the likely effect or uncertainty>"
    }
  ],
  "confidence": "<high|medium|low>"
}

Include all 9 issues in issueEvidence, using unknown/indirect language when the connection is weak. Include 2 concise items each for yesCase and noCase. Return ONLY the JSON object.`;
}

async function runJsonCompletion<T>(options: {
  model: string;
  maxTokens: number;
  prompt: string;
  webSearchMaxUses?: number;
  parseError: string;
}): Promise<T> {
  const response = await anthropic.messages.create({
    model: options.model,
    max_tokens: options.maxTokens,
    system: SYSTEM_PROMPT,
    tools: options.webSearchMaxUses
      ? [
          {
            type: "web_search_20250305" as const,
            name: "web_search" as const,
            max_uses: options.webSearchMaxUses,
          },
        ]
      : undefined,
    messages: [{ role: "user", content: options.prompt }],
  });

  let responseText = "";
  for (const block of response.content) {
    if (block.type === "text") {
      responseText += block.text;
    }
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(options.parseError);
  }

  return JSON.parse(jsonMatch[0]) as T;
}

async function runJsonCompletionWithContent<T>(options: {
  model: string;
  maxTokens: number;
  prompt: string;
  content: Array<Record<string, unknown>>;
  parseError: string;
}): Promise<T> {
  const response = await anthropic.messages.create({
    model: options.model,
    max_tokens: options.maxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...options.content,
          { type: "text", text: options.prompt },
        ] as never,
      },
    ],
  });

  let responseText = "";
  for (const block of response.content) {
    if (block.type === "text") {
      responseText += block.text;
    }
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(options.parseError);
  }

  return JSON.parse(jsonMatch[0]) as T;
}

export function runCandidateDossierResearch(
  req: ResearchRequest
): Promise<CandidateDossier> {
  return runJsonCompletion<CandidateDossier>({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2600,
    prompt: buildCandidateDossierPrompt(req.candidate, req.race, req.state),
    webSearchMaxUses: 2,
    parseError: "Could not parse candidate dossier",
  });
}

export function personalizeCandidateDossier(
  req: ResearchRequest,
  dossier: CandidateDossier,
  mode: "full" | "starter" = "full"
): Promise<CandidateResult> {
  return runJsonCompletion<CandidateResult>({
    model: "claude-haiku-4-5-20251001",
    maxTokens: mode === "starter" ? 1800 : 2600,
    prompt: buildUserPrompt(
      req.candidate,
      req.race,
      req.state,
      req.profile,
      dossier,
      mode
    ),
    parseError:
      mode === "starter"
        ? "Could not parse starter analysis results"
        : "Could not parse personalized candidate research",
  });
}

export function runMeasureDossierResearch(
  req: MeasureResearchRequest
): Promise<MeasureDossier> {
  return runJsonCompletion<MeasureDossier>({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2600,
    prompt: buildMeasureDossierPrompt(req.measure, req.state),
    webSearchMaxUses: 2,
    parseError: "Could not parse measure dossier",
  });
}

export function personalizeMeasureDossier(
  req: MeasureResearchRequest,
  dossier: MeasureDossier
): Promise<MeasureResult> {
  return runJsonCompletion<MeasureResult>({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2200,
    prompt: buildMeasurePrompt(req.measure, req.state, req.profile, dossier),
    parseError: "Could not parse personalized measure research",
  });
}

export function parseBallotReviewDraft(input: {
  ballotText: string;
  state: string | null;
}): Promise<BallotReviewDraft> {
  return runJsonCompletion<BallotReviewDraft>({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1800,
    prompt: buildBallotTextParsePrompt(input),
    parseError: "Could not parse ballot review draft",
  });
}

export function parseBallotReviewDraftFile(input: {
  fileName: string;
  mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  base64Data: string;
  state: string | null;
}): Promise<BallotReviewDraft> {
  const attachment =
    input.mediaType === "application/pdf"
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: input.mediaType,
            data: input.base64Data,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: input.mediaType,
            data: input.base64Data,
          },
        };

  return runJsonCompletionWithContent<BallotReviewDraft>({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2200,
    prompt: buildBallotFileParsePrompt({
      state: input.state,
      fileName: input.fileName,
    }),
    content: [attachment],
    parseError: "Could not parse uploaded ballot draft",
  });
}
