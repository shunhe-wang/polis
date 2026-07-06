const RESET_PASSWORD_PATH = "/auth/reset-password";

export function getSafeAuthRedirect(next: string | null): string {
  if (!next || !next.startsWith("/") || next.includes("\\")) return "/";

  const appOrigin = "https://polis.invalid";
  const destination = new URL(next, appOrigin);
  if (destination.origin !== appOrigin) return "/";

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function buildPasswordRecoveryRedirect(origin: string): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", RESET_PASSWORD_PATH);
  return callback.toString();
}
