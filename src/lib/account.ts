import type { UserTier } from "@/lib/freemium";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getProEmails(): string[] {
  return (process.env.PRO_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map(normalizeEmail);
}

export function isProEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getProEmails().includes(normalizeEmail(email));
}

export function getUserTierForEmail(
  email: string | null | undefined
): UserTier {
  if (!email) return "guest";
  return isProEmail(email) ? "pro" : "free";
}
