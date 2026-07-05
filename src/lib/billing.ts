import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductKey = "election_pass";

export interface AccountEntitlements {
  election_pass_credits: number;
  power_pass_runs_remaining: number;
  power_pass_expires_at: string | null;
}

export interface GuideAccessStatus {
  unlocked: boolean;
  source: "existing" | "election_pass" | null;
  canUnlock: boolean;
  electionPassCredits: number;
}

export const DEFAULT_ENTITLEMENTS: AccountEntitlements = {
  election_pass_credits: 0,
  power_pass_runs_remaining: 0,
  power_pass_expires_at: null,
};

export interface ProductConfig {
  key: ProductKey;
  label: string;
  description: string;
  priceEnv: string;
  creditsGranted: number;
}

const PRODUCT_CONFIGS: ProductConfig[] = [
  {
    key: "election_pass",
    label: "Election Pass",
    description: "Adds one $1 full-ballot guide credit to your account.",
    priceEnv: "STRIPE_PRICE_ELECTION_PASS",
    creditsGranted: 1,
  },
];

export function listProductConfigs(): ProductConfig[] {
  return PRODUCT_CONFIGS;
}

export function getProductConfig(key: string): ProductConfig | null {
  return PRODUCT_CONFIGS.find((product) => product.key === key) ?? null;
}

export function getProductPriceId(key: ProductKey): string | null {
  const product = getProductConfig(key);
  if (!product) return null;
  return process.env[product.priceEnv] ?? null;
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      PRODUCT_CONFIGS.every((product) => Boolean(process.env[product.priceEnv]))
  );
}

export async function getCurrentEntitlements(
  supabase: SupabaseClient,
  userId: string
): Promise<AccountEntitlements> {
  const { data, error } = await supabase
    .from("account_entitlements")
    .select(
      "election_pass_credits, power_pass_runs_remaining, power_pass_expires_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_ENTITLEMENTS;
  }

  return {
    election_pass_credits: Number(data.election_pass_credits ?? 0),
    power_pass_runs_remaining: Number(data.power_pass_runs_remaining ?? 0),
    power_pass_expires_at: data.power_pass_expires_at ?? null,
  };
}

export async function getGuideAccessStatus(
  supabase: SupabaseClient,
  user: { id: string } | null,
  ballotHash: string
): Promise<GuideAccessStatus> {
  if (!user) {
    return {
      unlocked: false,
      source: null,
      canUnlock: false,
      electionPassCredits: 0,
    };
  }

  const entitlements = await getCurrentEntitlements(supabase, user.id);

  const { data } = await supabase
    .from("guide_access_grants")
    .select("access_source, expires_at")
    .eq("user_id", user.id)
    .eq("ballot_hash", ballotHash)
    .maybeSingle();

  const hasExistingGrant =
    !!data &&
    (!data.expires_at || new Date(data.expires_at).getTime() > Date.now());

  if (hasExistingGrant) {
    return {
      unlocked: true,
      source: "existing",
      canUnlock: false,
      electionPassCredits: entitlements.election_pass_credits,
    };
  }

  return {
    unlocked: false,
    source: null,
    canUnlock: entitlements.election_pass_credits > 0,
    electionPassCredits: entitlements.election_pass_credits,
  };
}
