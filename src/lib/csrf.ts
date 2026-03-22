interface OriginRequestLike {
  headers: Headers;
  url: string;
}

export function getSameOriginError(request: OriginRequestLike): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const requestUrl = new URL(request.url);
  const expectedOrigin = forwardedHost
    ? `${forwardedProto ?? requestUrl.protocol.replace(":", "")}://${forwardedHost}`
    : requestUrl.origin;

  return origin === expectedOrigin ? null : "Cross-site request blocked";
}
