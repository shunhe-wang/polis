// ─── Issue & Identity Types ────────────────────────────────────────

export const ISSUES = [
  'economy',
  'healthcare',
  'climate',
  'immigration',
  'housing',
  'civil_liberties',
  'foreign_policy',
  'education',
  'crypto_tech',
] as const;

export type Issue = (typeof ISSUES)[number];

export const ISSUE_LABELS: Record<Issue, string> = {
  economy: 'Economy & Jobs',
  healthcare: 'Healthcare',
  climate: 'Climate & Environment',
  immigration: 'Immigration',
  housing: 'Housing & Cost of Living',
  civil_liberties: 'Civil Liberties & Rights',
  foreign_policy: 'Foreign Policy & Defense',
  education: 'Education',
  crypto_tech: 'Crypto & Tech Regulation',
};

export const ISSUE_DESCRIPTIONS: Record<Issue, string> = {
  economy: 'Taxes, wages, trade, inflation, and economic growth',
  healthcare: 'Insurance, drug prices, public health, and Medicare/Medicaid',
  climate: 'Clean energy, emissions, environmental regulation, and conservation',
  immigration: 'Border policy, legal immigration, DACA, and refugee policy',
  housing: 'Rent, home ownership, zoning, and homelessness',
  civil_liberties: 'Free speech, privacy, voting rights, and equal protection',
  foreign_policy: 'Military, alliances, diplomacy, and international aid',
  education: 'K-12, higher ed, student debt, and school choice',
  crypto_tech: 'Digital assets, AI regulation, privacy tech, and innovation policy',
};

export const POLITICAL_IDENTITIES = [
  'progressive',
  'moderate',
  'conservative',
  'libertarian',
  'prefer_not_to_say',
] as const;

export type PoliticalIdentity = (typeof POLITICAL_IDENTITIES)[number];

export const IDENTITY_LABELS: Record<PoliticalIdentity, string> = {
  progressive: 'Progressive',
  moderate: 'Moderate',
  conservative: 'Conservative',
  libertarian: 'Libertarian',
  prefer_not_to_say: 'Prefer not to say',
};

// ─── Values Profile ────────────────────────────────────────────────

export interface ValuesProfile {
  issueRatings: Record<Issue, number>; // 1–5
  freeText: string;
  politicalIdentity: PoliticalIdentity | null;
}

export function createEmptyValuesProfile(): ValuesProfile {
  const issueRatings = {} as Record<Issue, number>;
  for (const issue of ISSUES) {
    issueRatings[issue] = 3; // default to middle
  }
  return {
    issueRatings,
    freeText: '',
    politicalIdentity: null,
  };
}

// ─── Ballot & Candidate Types ──────────────────────────────────────

export interface Race {
  id: string;
  name: string; // e.g. "US Senate", "Governor", "City Council District 5"
  level: 'federal' | 'state' | 'local';
  candidates: Candidate[];
}

export interface Candidate {
  id: string;
  name: string;
  party: string | null;
}

export interface BallotMeasure {
  id: string;
  title: string;
  description: string;
  type: 'referendum' | 'initiative' | 'amendment' | 'other';
}

export interface BallotInput {
  address: string;
  state: string;
  races: Race[];
  measures: BallotMeasure[];
}

// ─── AI Research Results ───────────────────────────────────────────

export interface CitedClaim {
  text: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface IssueAlignment {
  issue: Issue;
  score: number; // 0–100
  summary: string;
  candidatePosition: string;
  userPriority: number; // 1–5 from values profile
}

export interface CandidateResult {
  candidateId: string;
  name: string;
  party: string | null;
  race: string;
  alignmentScore: number; // 0–100
  issueBreakdown: IssueAlignment[];
  likes: CitedClaim[];
  concerns: CitedClaim[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface MeasureResult {
  measureId: string;
  title: string;
  summary: string;
  alignmentScore: number; // 0–100 how well it aligns with user values
  prosForVoter: CitedClaim[];
  consForVoter: CitedClaim[];
  recommendation: 'yes' | 'no' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface RaceRecommendation {
  raceId: string;
  raceName: string;
  candidates: CandidateResult[];
  recommendedCandidateId: string | null;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface VoterGuide {
  id: string;
  userId: string | null;
  valuesProfile: ValuesProfile;
  ballotInput: BallotInput;
  recommendations: RaceRecommendation[];
  measureResults?: MeasureResult[];
  createdAt: string;
}
