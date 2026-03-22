import Anthropic from "@anthropic-ai/sdk";
import type { ValuesProfile, Race, Candidate, BallotMeasure, Issue } from "./types";
import { ISSUE_LABELS } from "./types";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a non-partisan political research assistant. Your job is to research candidates running for office and evaluate how well their positions align with a voter's stated values and priorities.

Rules:
1. Be factual and cite sources for every claim. Include URLs where possible.
2. Never express your own political opinions or endorse any candidate.
3. Present both strengths and concerns from the voter's perspective.
4. If you cannot find reliable information about a candidate, say so clearly rather than speculating.
5. Score alignment honestly — a 50 means neutral/unknown, not a default.
6. Weight the alignment score by the voter's issue priority ratings (1-5). Issues rated 5 should matter much more than issues rated 1.
7. Return ONLY valid JSON — no markdown fences, no commentary before or after.`;

function formatIssueRatings(ratings: Record<Issue, number>): string {
  return Object.entries(ratings)
    .map(([issue, rating]) => `- ${ISSUE_LABELS[issue as Issue]}: ${rating}/5`)
    .join("\n");
}

function buildUserPrompt(
  candidate: Candidate,
  race: Race,
  state: string,
  profile: ValuesProfile
): string {
  return `Research the following candidate and evaluate alignment with my values profile.

## Candidate
- Name: ${candidate.name}
- Race: ${race.name}
- Party: ${candidate.party ?? "Unknown"}
- Location: ${state}

## My Values Profile
### Issue Priorities (1=not important, 5=top priority)
${formatIssueRatings(profile.issueRatings)}

### What matters most to me
${profile.freeText || "No additional context provided."}

### Political identity
${profile.politicalIdentity ?? "Not specified"}

## Instructions
Search for this candidate's recent positions, voting record, public statements, endorsements, and donor information. Then provide your analysis as a JSON object with this exact structure:

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
      "summary": "<1-2 sentence alignment summary>",
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
  "reasoning": "<2-3 paragraph explanation of the overall alignment score and key factors>"
}

Include 2-3 items each for "likes" and "concerns". Include an issueBreakdown entry for each of the 9 issues. Return ONLY the JSON object.`;
}

function buildMeasurePrompt(
  measure: BallotMeasure,
  state: string,
  profile: ValuesProfile
): string {
  return `Research the following ballot measure and evaluate how it aligns with my values profile.

## Ballot Measure
- Title: ${measure.title}
- Type: ${measure.type}
- Location: ${state}
- Description: ${measure.description}

## My Values Profile
### Issue Priorities (1=not important, 5=top priority)
${formatIssueRatings(profile.issueRatings)}

### What matters most to me
${profile.freeText || "No additional context provided."}

### Political identity
${profile.politicalIdentity ?? "Not specified"}

## Instructions
Search the web for information about this ballot measure — who supports it, who opposes it, what it would actually do, and its likely impact. Then provide your analysis as a JSON object with this exact structure:

{
  "measureId": "${measure.id}",
  "title": "${measure.title}",
  "summary": "<plain-language 2-3 sentence explanation of what this measure does>",
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
  "reasoning": "<2-3 paragraph explanation of the measure and its alignment with this voter's values>"
}

Include 2-3 items each for "prosForVoter" and "consForVoter". Return ONLY the JSON object.`;
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

export function createResearchStream(req: ResearchRequest) {
  const userPrompt = buildUserPrompt(
    req.candidate,
    req.race,
    req.state,
    req.profile
  );

  return anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search" as const,
        max_uses: 10,
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });
}

export function createMeasureResearchStream(req: MeasureResearchRequest) {
  const userPrompt = buildMeasurePrompt(req.measure, req.state, req.profile);

  return anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search" as const,
        max_uses: 10,
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });
}
