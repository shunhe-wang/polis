import { createAdminClient } from "@/lib/supabase/admin";

export interface AppEventInput {
  category: string;
  event: string;
  severity?: "info" | "warning" | "error";
  route?: string;
  userId?: string | null;
  details?: Record<string, unknown>;
}

export async function recordAppEvent(input: AppEventInput): Promise<void> {
  const logLine = JSON.stringify({
    level: input.severity ?? "info",
    category: input.category,
    event: input.event,
    route: input.route ?? null,
    userId: input.userId ?? null,
    details: input.details ?? {},
  });

  const admin = createAdminClient();
  if (!admin) {
    if (input.severity === "error") {
      process.stderr.write(`${logLine}\n`);
    }
    return;
  }

  const { error } = await admin.from("app_event_logs").insert({
    category: input.category,
    event: input.event,
    severity: input.severity ?? "info",
    route: input.route ?? null,
    user_id: input.userId ?? null,
    details: input.details ?? {},
  });

  if (error && input.severity === "error") {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        category: "observability",
        event: "app_event_insert_failed",
        route: input.route ?? null,
        userId: input.userId ?? null,
        details: {
          ...input.details,
          insertError: error.message,
        },
      })}\n`
    );
  }
}
