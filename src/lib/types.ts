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

export const CORE_ISSUES = [
  'economy',
  'healthcare',
  'housing',
  'immigration',
  'climate',
  'education',
] as const satisfies readonly Issue[];

export const ADVANCED_ISSUES = [
  'civil_liberties',
  'foreign_policy',
  'crypto_tech',
] as const satisfies readonly Issue[];

export const POLITICAL_IDENTITIES = [
  'progressive',
  'liberal',
  'moderate',
  'conservative',
  'libertarian',
  'independent',
  'prefer_not_to_say',
] as const;

export type PoliticalIdentity = (typeof POLITICAL_IDENTITIES)[number];

export const IDENTITY_LABELS: Record<PoliticalIdentity, string> = {
  progressive: 'Progressive',
  liberal: 'Liberal',
  moderate: 'Moderate',
  conservative: 'Conservative',
  libertarian: 'Libertarian',
  independent: 'Independent',
  prefer_not_to_say: 'Prefer not to say',
};

export const POLICY_SIGNALS = [
  'taxes_and_spending',
  'immigration_approach',
  'housing_growth',
  'social_rights',
  'energy_and_climate',
] as const;

export type PolicySignal = (typeof POLICY_SIGNALS)[number];

export const POLICY_SIGNAL_CHOICES = {
  taxes_and_spending: [
    'lower_taxes_smaller_government',
    'balanced_fiscal_approach',
    'more_public_investment',
  ],
  immigration_approach: [
    'stricter_border_and_enforcement',
    'balanced_border_and_legal_pathways',
    'more_open_immigration_and_pathways',
  ],
  housing_growth: [
    'protect_existing_neighborhoods',
    'balanced_housing_growth',
    'build_more_housing_even_with_zoning_change',
  ],
  social_rights: [
    'more_traditional_social_policy',
    'mixed_or_case_by_case',
    'stronger_protection_for_lgbtq_and_reproductive_rights',
  ],
  energy_and_climate: [
    'lower_energy_costs_and_domestic_production',
    'balanced_energy_transition',
    'aggressive_clean_energy_and_emissions_cuts',
  ],
} as const;

export type PolicySignalChoice<K extends PolicySignal = PolicySignal> =
  (typeof POLICY_SIGNAL_CHOICES)[K][number];

export type PolicySignals = {
  [K in PolicySignal]: PolicySignalChoice<K> | null;
};

export const POLICY_SIGNAL_LABELS: Record<PolicySignal, string> = {
  taxes_and_spending: 'Taxes and Government Spending',
  immigration_approach: 'Immigration and Border Policy',
  housing_growth: 'Housing Growth and Zoning',
  social_rights: 'Social Rights and Liberties',
  energy_and_climate: 'Energy and Climate',
};

export const POLICY_SIGNAL_CHOICE_LABELS: {
  [K in PolicySignal]: Record<PolicySignalChoice<K>, string>;
} = {
  taxes_and_spending: {
    lower_taxes_smaller_government: 'Lower taxes, smaller government',
    balanced_fiscal_approach: 'Pragmatic middle ground',
    more_public_investment: 'More public investment and services',
  },
  immigration_approach: {
    stricter_border_and_enforcement: 'Stricter border and enforcement',
    balanced_border_and_legal_pathways: 'Secure border with legal pathways',
    more_open_immigration_and_pathways: 'More open immigration and pathways',
  },
  housing_growth: {
    protect_existing_neighborhoods: 'Protect neighborhood character',
    balanced_housing_growth: 'Balanced growth',
    build_more_housing_even_with_zoning_change:
      'Build much more housing, even with zoning changes',
  },
  social_rights: {
    more_traditional_social_policy: 'More traditional restrictions',
    mixed_or_case_by_case: 'Mixed or case-by-case',
    stronger_protection_for_lgbtq_and_reproductive_rights:
      'Stronger LGBTQ and reproductive rights protections',
  },
  energy_and_climate: {
    lower_energy_costs_and_domestic_production:
      'Lower energy costs and more domestic production',
    balanced_energy_transition: 'Balanced transition',
    aggressive_clean_energy_and_emissions_cuts:
      'Aggressive clean energy and emissions cuts',
  },
};

// ─── Values Profile ────────────────────────────────────────────────

export interface ValuesProfile {
  issueRatings: Record<Issue, number>; // 1–5
  policySignals: PolicySignals;
  freeText: string;
  politicalIdentity: PoliticalIdentity | null;
}

export function createEmptyValuesProfile(): ValuesProfile {
  const issueRatings = {} as Record<Issue, number>;
  for (const issue of ISSUES) {
    issueRatings[issue] = 3; // default to middle
  }
  const policySignals = {} as PolicySignals;
  for (const signal of POLICY_SIGNALS) {
    policySignals[signal] = null;
  }
  return {
    issueRatings,
    policySignals,
    freeText: '',
    politicalIdentity: null,
  };
}

export function hydrateValuesProfile(
  value: Partial<ValuesProfile> | null | undefined
): ValuesProfile {
  const empty = createEmptyValuesProfile();

  return {
    issueRatings: {
      ...empty.issueRatings,
      ...(value?.issueRatings ?? {}),
    },
    policySignals: {
      ...empty.policySignals,
      ...(value?.policySignals ?? {}),
    },
    freeText: value?.freeText ?? '',
    politicalIdentity: value?.politicalIdentity ?? null,
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

export interface DossierIssueNote {
  issue: Issue;
  summary: string;
  stance: string;
}

export interface CandidateDossier {
  name: string;
  party: string | null;
  race: string;
  state: string;
  overview: string;
  issueEvidence: DossierIssueNote[];
  strengths: CitedClaim[];
  concerns: CitedClaim[];
  confidence: "high" | "medium" | "low";
}

export interface MeasureDossier {
  title: string;
  state: string;
  summary: string;
  yesCase: CitedClaim[];
  noCase: CitedClaim[];
  issueEvidence: DossierIssueNote[];
  confidence: "high" | "medium" | "low";
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
