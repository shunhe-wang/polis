import type { AppEventInput } from "@/lib/observability";

// Best-effort external alert delivery. When ALERT_WEBHOOK_URL is set, every
// recorded app event at or above ALERT_MIN_SEVERITY (default: error) is
// POSTed as JSON with a Slack-compatible "text" field. Delivery failures are
// swallowed: alerting must never break the code path that raised the alert.

const WEBHOOK_TIMEOUT_MS = 5_000;

export function shouldDeliverAlert(
  severity: AppEventInput["severity"],
  minSeverity: string | undefined
): boolean {
  const threshold = minSeverity?.trim() === "warning" ? "warning" : "error";
  if (severity === "error") return true;
  return severity === "warning" && threshold === "warning";
}

export function buildAlertPayload(input: AppEventInput): {
  text: string;
  severity: string;
  category: string;
  event: string;
  route: string | null;
  details: Record<string, unknown>;
} {
  const severity = input.severity ?? "info";
  return {
    text: `[polis ${severity}] ${input.category}/${input.event}${
      input.route ? ` (${input.route})` : ""
    }`,
    severity,
    category: input.category,
    event: input.event,
    route: input.route ?? null,
    details: input.details ?? {},
  };
}

export async function deliverAlertWebhook(input: AppEventInput): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return;
  if (!shouldDeliverAlert(input.severity, process.env.ALERT_MIN_SEVERITY)) {
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAlertPayload(input)),
      cache: "no-store",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch {
    // Best-effort only.
  }
}
