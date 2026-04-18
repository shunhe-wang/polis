import type { User } from "@supabase/supabase-js";

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "dispostable.com",
  "fakeinbox.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "sharklasers.com",
  "tempmail.com",
  "tempmailo.com",
  "trashmail.com",
  "yopmail.com",
]);

export interface AccountTrustStatus {
  trusted: boolean;
  requiresVerifiedEmail: boolean;
  requiresNonDisposableEmail: boolean;
  emailVerified: boolean;
  isDisposableDomain: boolean;
  reason: string | null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export function getEmailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return null;
  return normalized.slice(normalized.lastIndexOf("@") + 1);
}

export function isDisposableEmailDomain(
  email: string | null | undefined
): boolean {
  const domain = getEmailDomain(email);
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}

export function shouldRequireVerifiedEmail(): boolean {
  return (
    process.env.REQUIRE_VERIFIED_EMAIL === "true" ||
    process.env.NODE_ENV === "production"
  );
}

export function shouldBlockDisposableEmails(): boolean {
  return (
    process.env.BLOCK_DISPOSABLE_EMAILS === "true" ||
    process.env.NODE_ENV === "production"
  );
}

export function getAccountTrustStatus(
  user: Pick<User, "email" | "email_confirmed_at"> | null
): AccountTrustStatus {
  const requiresVerifiedEmail = shouldRequireVerifiedEmail();
  const requiresNonDisposableEmail = shouldBlockDisposableEmails();
  const emailVerified = Boolean(user?.email_confirmed_at);
  const isDisposableDomain = isDisposableEmailDomain(user?.email);

  if (!user?.email) {
    return {
      trusted: false,
      requiresVerifiedEmail,
      requiresNonDisposableEmail,
      emailVerified: false,
      isDisposableDomain: false,
      reason: "Sign in to use this feature.",
    };
  }

  if (requiresNonDisposableEmail && isDisposableDomain) {
    return {
      trusted: false,
      requiresVerifiedEmail,
      requiresNonDisposableEmail,
      emailVerified,
      isDisposableDomain,
      reason:
        "Use a real email address to unlock starter analysis, credit purchases, or AI research.",
    };
  }

  if (requiresVerifiedEmail && !emailVerified) {
    return {
      trusted: false,
      requiresVerifiedEmail,
      requiresNonDisposableEmail,
      emailVerified,
      isDisposableDomain,
      reason:
        "Verify your email before using starter analysis, credit purchases, or full research.",
    };
  }

  return {
    trusted: true,
    requiresVerifiedEmail,
    requiresNonDisposableEmail,
    emailVerified,
    isDisposableDomain,
    reason: null,
  };
}
