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
import { recordAppEvent } from "./observability";

const DEFAULT_ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_ZAI_MODEL = "glm-5.2";

type ZaiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string };

interface ZaiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface ZaiLayoutParsingResponse {
  md_results?: string;
}

interface ZaiErrorResponse {
  error?: { message?: string };
  message?: string;
}

class ZaiApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ZaiApiError";
  }
}

// Map internal provider/database errors to a message safe to show end users.
// Raw upstream error bodies and stack-adjacent messages stay in app_event_logs
// (recorded at the failure site), never in API responses.
export function toUserFacingResearchError(
  err: unknown,
  fallback: string
): string {
  if (err instanceof Error && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (status === 429) {
      return "Rate limited by the AI service. Please try again in a moment.";
    }
  }
  if (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  ) {
    return "The AI service took too long to respond. Please try again.";
  }
  return fallback;
}

function getZaiConfig(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  const apiKey = process.env.ZAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Z.AI API key is not configured");
  }

  return {
    apiKey,
    baseUrl: (process.env.ZAI_BASE_URL?.trim() || DEFAULT_ZAI_BASE_URL).replace(
      /\/+$/,
      ""
    ),
    model: process.env.ZAI_MODEL?.trim() || DEFAULT_ZAI_MODEL,
  };
}

export function isZaiConfigured(): boolean {
  return Boolean(process.env.ZAI_API_KEY?.trim());
}

const DEFAULT_ZAI_TIMEOUT_MS = 120_000;

function getZaiTimeoutMs(): number {
  const configured = Number.parseInt(process.env.ZAI_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_ZAI_TIMEOUT_MS;
}

async function postToZai<T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const { apiKey, baseUrl } = getZaiConfig();
  const startedAt = Date.now();
  const model = typeof body.model === "string" ? body.model : "unknown";
  let response: Response;

  // A hung upstream must not stall a research stream until the platform kills
  // the function; every request gets a timeout even when the caller passes no
  // signal of its own.
  const timeoutSignal = AbortSignal.timeout(getZaiTimeoutMs());
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept-Language": "en-US,en",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: requestSignal,
    });
  } catch (error) {
    await recordAppEvent({
      category: "provider",
      event: "zai_request_failed",
      severity: "error",
      details: {
        path,
        model,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Network error",
      },
    });
    throw error;
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & ZaiErrorResponse)
    | null;

  if (!response.ok) {
    const detail =
      payload?.error?.message || payload?.message || response.statusText;
    await recordAppEvent({
      category: "provider",
      event: "zai_request_failed",
      severity: "error",
      details: {
        path,
        model,
        status: response.status,
        durationMs: Date.now() - startedAt,
        message: `Z.AI request failed with status ${response.status}`,
      },
    });
    throw new ZaiApiError(
      `Z.AI API request failed (${response.status})${detail ? `: ${detail}` : ""}`,
      response.status
    );
  }

  if (!payload) {
    await recordAppEvent({
      category: "provider",
      event: "zai_request_failed",
      severity: "error",
      details: {
        path,
        model,
        status: response.status,
        durationMs: Date.now() - startedAt,
        message: "Z.AI API returned an empty response",
      },
    });
    throw new Error("Z.AI API returned an empty response");
  }

  const usage = (payload as { usage?: Record<string, unknown> }).usage;
  const webSearchToolAttached =
    Array.isArray(body.tools) &&
    body.tools.some(
      (tool) =>
        tool &&
        typeof tool === "object" &&
        "type" in tool &&
        tool.type === "web_search"
    );
  // Prefer the provider-reported search count when present; the attached-tool
  // fallback is an estimate (the model may search zero or several times).
  const reportedWebSearchCount = [
    usage?.web_search_count,
    usage?.webSearchCount,
  ].find((value) => typeof value === "number" && Number.isFinite(value)) as
    | number
    | undefined;
  const webSearchUses =
    reportedWebSearchCount ?? (webSearchToolAttached ? 1 : 0);
  await recordAppEvent({
    category: "provider",
    event: "zai_request_succeeded",
    details: {
      path,
      model,
      status: response.status,
      durationMs: Date.now() - startedAt,
      totalTokens:
        typeof usage?.total_tokens === "number" ? usage.total_tokens : 0,
      promptTokens:
        typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
      completionTokens:
        typeof usage?.completion_tokens === "number"
          ? usage.completion_tokens
          : 0,
      webSearchUses,
    },
  });

  return payload;
}

async function createZaiCompletion(options: {
  messages: ZaiMessage[];
  maxTokens: number;
  webSearchResultCount?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const { model } = getZaiConfig();
  const response = await postToZai<ZaiChatCompletionResponse>(
    "/chat/completions",
    {
      model,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: 0.2,
      thinking: { type: "enabled" },
      response_format: { type: "json_object" },
      tools: options.webSearchResultCount
        ? [
            {
              type: "web_search",
              web_search: {
                enable: true,
                search_engine: "search_pro_jina",
                count: options.webSearchResultCount,
                content_size: "high",
                search_result: true,
                require_search: true,
              },
            },
          ]
        : undefined,
    },
    options.signal
  );

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Z.AI API returned no response content");
  }

  return content;
}

function parseJsonObject<T>(responseText: string, parseError: string): T {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(parseError);
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    throw new Error(parseError);
  }
}

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
- If the pasted text appears to come from multiple pages or sections, combine them into one draft without duplicating repeated headers.
- If a race continues onto another page, keep the race and include the candidates you can confidently extract.

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
- Preserve the ballot's jurisdiction-specific race names.
- Inspect the entire uploaded file, including all pages of a PDF.
- If multiple pages repeat election headers or instructions, do not duplicate them as races or measures.
- If the file contains only part of the ballot, return the partial draft and mention that in notes.`;
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
  maxTokens: number;
  prompt: string;
  webSearchResultCount?: number;
  parseError: string;
}): Promise<T> {
  const responseText = await createZaiCompletion({
    maxTokens: options.maxTokens,
    webSearchResultCount: options.webSearchResultCount,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: options.prompt },
    ],
  });

  return parseJsonObject<T>(responseText, options.parseError);
}

export function runCandidateDossierResearch(
  req: ResearchRequest
): Promise<CandidateDossier> {
  return runJsonCompletion<CandidateDossier>({
    maxTokens: 2600,
    prompt: buildCandidateDossierPrompt(req.candidate, req.race, req.state),
    webSearchResultCount: 10,
    parseError: "Could not parse candidate dossier",
  });
}

export function personalizeCandidateDossier(
  req: ResearchRequest,
  dossier: CandidateDossier,
  mode: "full" | "starter" = "full"
): Promise<CandidateResult> {
  return runJsonCompletion<CandidateResult>({
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
    maxTokens: 2600,
    prompt: buildMeasureDossierPrompt(req.measure, req.state),
    webSearchResultCount: 10,
    parseError: "Could not parse measure dossier",
  });
}

export function personalizeMeasureDossier(
  req: MeasureResearchRequest,
  dossier: MeasureDossier
): Promise<MeasureResult> {
  return runJsonCompletion<MeasureResult>({
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
    maxTokens: 2400,
    prompt: buildBallotTextParsePrompt(input),
    parseError: "Could not parse ballot review draft",
  });
}

export async function parseBallotReviewDraftFile(input: {
  fileName: string;
  mediaType: "application/pdf" | "image/png" | "image/jpeg";
  base64Data: string;
  state: string | null;
}): Promise<BallotReviewDraft> {
  const extracted = await postToZai<ZaiLayoutParsingResponse>(
    "/layout_parsing",
    {
      model: "glm-ocr",
      file: `data:${input.mediaType};base64,${input.base64Data}`,
      return_crop_images: false,
      need_layout_visualization: false,
    }
  );
  const extractedText = extracted.md_results?.trim();
  if (!extractedText) {
    throw new Error("Z.AI OCR could not extract text from the ballot upload");
  }

  return runJsonCompletion<BallotReviewDraft>({
    maxTokens: 3200,
    prompt: `${buildBallotFileParsePrompt({
      state: input.state,
      fileName: input.fileName,
    })}\n\n## Extracted file content\n${extractedText}`,
    parseError: "Could not parse uploaded ballot draft",
  });
}

export async function lookupCandidatesWithZai(input: {
  raceName: string;
  state: string;
  locality: string;
  signal?: AbortSignal;
}): Promise<Array<{ name: string; party: string | null }>> {
  const responseText = await createZaiCompletion({
    maxTokens: 1800,
    webSearchResultCount: 10,
    signal: input.signal,
    messages: [
      {
        role: "system",
        content:
          "You identify election candidates from current, authoritative sources. Return only valid JSON and do not guess.",
      },
      {
        role: "user",
        content: `List candidates for "${input.raceName}" in ${input.state}${input.locality ? `, ${input.locality}` : ""}. Restrict the search to the relevant election for that jurisdiction only. Return this exact shape: {"candidates":[{"name":"...","party":"..."}]}. Use an empty candidates array if unknown.`,
      },
    ],
  });
  const parsed = parseJsonObject<{
    candidates?: Array<{ name?: unknown; party?: unknown }>;
  }>(responseText, "Could not parse candidate lookup results");

  if (!Array.isArray(parsed.candidates)) {
    return [];
  }

  return parsed.candidates.flatMap((candidate) => {
    if (typeof candidate?.name !== "string" || !candidate.name.trim()) {
      return [];
    }
    return [
      {
        name: candidate.name.trim(),
        party:
          typeof candidate.party === "string" && candidate.party.trim()
            ? candidate.party.trim()
            : null,
      },
    ];
  });
}
