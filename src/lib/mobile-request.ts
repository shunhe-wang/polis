export function getMobileCorsHeaders(
  request: Request,
  methods: string[]
): Record<string, string> | null {
  const origin = request.headers.get("origin");
  const allowedOrigin = process.env.MOBILE_APP_ORIGIN?.trim();
  if (!origin || !allowedOrigin || origin !== allowedOrigin) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
    Vary: "Origin",
  };
}

export function getBearerAccessToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}
