import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSameOriginError } from "@/lib/csrf";
import { recordAppEvent } from "@/lib/observability";
import {
  CONTENT_REPORT_DAILY_LIMIT,
  parseContentReportInput,
} from "@/lib/content-reports";

async function getAuthenticatedContext() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedContext();
  if (!supabase || !user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("content_reports")
    .select("id, category, subject_type, subject_name, race_name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: "Could not load reports" },
      { status: 500 }
    );
  }

  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json({ error: csrfError }, { status: 403 });
  }

  const { user } = await getAuthenticatedContext();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Report storage is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseContentReportInput(body);
  if (parsed.error !== null) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("content_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);

  if (countError) {
    return NextResponse.json(
      { error: "Could not submit the report" },
      { status: 500 }
    );
  }
  if ((count ?? 0) >= CONTENT_REPORT_DAILY_LIMIT) {
    return NextResponse.json(
      { error: "Report limit reached. Please try again tomorrow." },
      { status: 429 }
    );
  }

  const { input } = parsed;
  const { data, error } = await admin
    .from("content_reports")
    .insert({
      user_id: user.id,
      category: input.category,
      subject_type: input.subjectType,
      subject_name: input.subjectName,
      race_name: input.raceName,
      details: input.details,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Could not submit the report" },
      { status: 500 }
    );
  }

  await recordAppEvent({
    category: "content_reports",
    event: "content_report_submitted",
    severity: "warning",
    route: "/api/reports",
    userId: user.id,
    details: {
      reportId: data.id,
      category: input.category,
      subjectType: input.subjectType,
    },
  });

  return NextResponse.json({ id: data.id, status: "open" }, { status: 201 });
}
