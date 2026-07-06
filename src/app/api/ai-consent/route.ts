import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSameOriginError } from "@/lib/csrf";
import {
  AI_CONSENT_DISCLOSURE,
  CURRENT_AI_CONSENT_VERSION,
  userHasCurrentAiConsent,
} from "@/lib/ai-consent";

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

  return NextResponse.json({
    granted: await userHasCurrentAiConsent(supabase, user.id),
    consentVersion: CURRENT_AI_CONSENT_VERSION,
    disclosure: AI_CONSENT_DISCLOSURE,
  });
}

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json({ error: csrfError }, { status: 403 });
  }

  const { user } = await getAuthenticatedContext();
  const admin = createAdminClient();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  if (!admin) {
    return NextResponse.json(
      { error: "Consent storage is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    body.accept !== true ||
    body.consentVersion !== CURRENT_AI_CONSENT_VERSION
  ) {
    return NextResponse.json(
      { error: "Explicit consent to the current disclosure is required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("ai_data_consents").upsert(
    {
      user_id: user.id,
      consent_version: CURRENT_AI_CONSENT_VERSION,
      provider: AI_CONSENT_DISCLOSURE.provider,
      purpose: AI_CONSENT_DISCLOSURE.purpose,
      granted_at: now,
      revoked_at: null,
      updated_at: now,
    },
    { onConflict: "user_id,consent_version" }
  );

  if (error) {
    return NextResponse.json(
      { error: `Could not record consent: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    granted: true,
    consentVersion: CURRENT_AI_CONSENT_VERSION,
  });
}

export async function DELETE(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json({ error: csrfError }, { status: 403 });
  }

  const { user } = await getAuthenticatedContext();
  const admin = createAdminClient();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  if (!admin) {
    return NextResponse.json(
      { error: "Consent storage is not configured" },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("ai_data_consents")
    .update({ revoked_at: now, updated_at: now })
    .eq("user_id", user.id)
    .eq("consent_version", CURRENT_AI_CONSENT_VERSION);

  if (error) {
    return NextResponse.json(
      { error: `Could not revoke consent: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ granted: false });
}
