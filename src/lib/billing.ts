import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { UserTier } from "@/lib/freemium";

export type ProductKey =
  | "guest"
  | "free"
  | "election_pass"
  | "bundle_3"
  | "power_14d";

export interface AccountEntitlements {
  election_pass_credits: number;
  power_pass_runs_remaining: number;
  power_pass_expires_at: string | null;
}

export interface AccountPlan {
  tier: UserTier;
  planKey: ProductKey;
  planLabel: string;
}

export interface GuideAccessStatus {
  unlocked: boolean;
  source: "existing" | "election_pass" | "power_pass" | null;
  canUnlock: boolean;
  electionPassCredits: number;
  powerPassRunsRemaining: number;
  powerPassExpiresAt: string | null;
}

export const DEFAULT_ENTITLEMENTS: AccountEntitlements = {
  election_pass_credits: 0,
  power_pass_runs_remaining: 0,
  power_pass_expires_at: null,
};

export interface ProductConfig {
  key: Exclude<ProductKey, "guest" | "free">;
  label: string;
  description: string;
  priceEnv: string;
}

const PRODUCT_CONFIGS: ProductConfig[] = [
  {
    key: "election_pass",
    label: "Election Pass",
    description: "Unlock one full ballot guide for one ballot.",
    priceEnv: "STRIPE_PRICE_ELECTION_PASS",
  },
  {
    key: "bundle_3",
    label: "3-Pack",
    description: "Three ballot unlocks you can use over time.",
    priceEnv: "STRIPE_PRICE_BUNDLE_3",
  },
  {
    key: "power_14d",
    label: "Power Pass",
    description: "Ten unlocks over a 14-day power-user window.",
    priceEnv: "STRIPE_PRICE_POWER_14D",
  },
];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getProEmails(): string[] {
  return (process.env.PRO_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map(normalizeEmail);
}

export function hasPaidOverride(user: Pick<User, "email"> | null): boolean {
  return !!user?.email && getProEmails().includes(normalizeEmail(user.email));
}

export function listProductConfigs(): ProductConfig[] {
  return PRODUCT_CONFIGS;
}

export function getProductConfig(key: string): ProductConfig | null {
  return PRODUCT_CONFIGS.find((product) => product.key === key) ?? null;
}

export function getProductPriceId(
  key: Exclude<ProductKey, "guest" | "free">
): string | null {
  const product = getProductConfig(key);
  if (!product) return null;
  return process.env[product.priceEnv] ?? null;
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      PRODUCT_CONFIGS.some((product) => Boolean(process.env[product.priceEnv]))
  );
}

export function isPowerPassActive(
  entitlements: AccountEntitlements,
  now = new Date()
): boolean {
  return (
    entitlements.power_pass_runs_remaining > 0 &&
    !!entitlements.power_pass_expires_at &&
    new Date(entitlements.power_pass_expires_at).getTime() > now.getTime()
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

export function getAccountPlan(
  user: Pick<User, "email"> | null,
  entitlements: AccountEntitlements
): AccountPlan {
  if (!user?.email) {
    return {
      tier: "guest",
      planKey: "guest",
      planLabel: "Guest",
    };
  }

  if (isPowerPassActive(entitlements)) {
    return {
      tier: "pro",
      planKey: "power_14d",
      planLabel: "Power Pass",
    };
  }

  if (entitlements.election_pass_credits > 0) {
    return {
      tier: "pro",
      planKey: "election_pass",
      planLabel:
        entitlements.election_pass_credits > 1
          ? `${entitlements.election_pass_credits} Election Passes`
          : "Election Pass",
    };
  }

  if (hasPaidOverride(user)) {
    return {
      tier: "pro",
      planKey: "power_14d",
      planLabel: "Paid Access (Override)",
    };
  }

  return {
    tier: "free",
    planKey: "free",
    planLabel: "Free",
  };
}

export async function getGuideAccessStatus(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email"> | null,
  ballotHash: string
): Promise<GuideAccessStatus> {
  if (!user) {
    return {
      unlocked: false,
      source: null,
      canUnlock: false,
      electionPassCredits: 0,
      powerPassRunsRemaining: 0,
      powerPassExpiresAt: null,
    };
  }

  if (hasPaidOverride(user)) {
    return {
      unlocked: true,
      source: "existing",
      canUnlock: false,
      electionPassCredits: 0,
      powerPassRunsRemaining: 0,
      powerPassExpiresAt: null,
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
    (!data.expires_at ||
      new Date(data.expires_at).getTime() > Date.now());

  if (hasExistingGrant) {
    return {
      unlocked: true,
      source: "existing",
      canUnlock: false,
      electionPassCredits: entitlements.election_pass_credits,
      powerPassRunsRemaining: entitlements.power_pass_runs_remaining,
      powerPassExpiresAt: entitlements.power_pass_expires_at,
    };
  }

  const hasPowerPass = isPowerPassActive(entitlements);
  return {
    unlocked: false,
    source: null,
    canUnlock:
      hasPowerPass || entitlements.election_pass_credits > 0,
    electionPassCredits: entitlements.election_pass_credits,
    powerPassRunsRemaining: entitlements.power_pass_runs_remaining,
    powerPassExpiresAt: entitlements.power_pass_expires_at,
  };
}
