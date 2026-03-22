import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recordAppEvent } from "@/lib/observability";
import { getSameOriginError } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json(
      { error: csrfError },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured" },
      { status: 503 }
    );
  }

  const { data, error } = await admin.rpc("cleanup_app_operational_data", {
    p_now: new Date().toISOString(),
  });

  if (error) {
    await recordAppEvent({
      category: "ops",
      event: "cleanup_failed",
      severity: "error",
      route: "/api/admin/cleanup",
      userId: user.id,
      details: { message: error.message },
    });
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    );
  }

  await recordAppEvent({
    category: "ops",
    event: "cleanup_completed",
    route: "/api/admin/cleanup",
    userId: user.id,
    details:
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {},
  });

  return NextResponse.json({ ok: true, result: data });
}
