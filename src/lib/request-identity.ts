import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { QuotaRule } from "@/lib/ai-quotas";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

export function buildScopedIpQuotaRules(
  request: NextRequest,
  rules: QuotaRule[]
): Array<{ rule: QuotaRule; incrementBy: number }> {
  const ip = getClientIp(request);
  if (!ip) return [];

  const ipHash = sha256(ip).slice(0, 24);

  return rules.map((rule) => ({
    rule: {
      ...rule,
      scope: `${rule.scope}:ip:${ipHash}`,
      maxUnits: Math.max(1, Math.ceil(rule.maxUnits * 2)),
    },
    incrementBy: 1,
  }));
}
