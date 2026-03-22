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
  const admin = createAdminClient();
  if (!admin) {
    if (input.severity === "error") {
      console.error("[app-event]", input);
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
    console.error("[app-event-insert-failed]", error.message, input);
  }
}
