import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentEntitlements,
  getGuideAccessStatus,
} from "@/lib/billing";
import { buildBallotHash } from "@/lib/research-cache";
import { recordAppEvent } from "@/lib/observability";
import type { BallotInput } from "@/lib/types";
import { isValidBallotInput } from "@/lib/validation";
import { getAccountTrustStatus } from "@/lib/account-trust";

interface GuideAccessBody {
  ballotInput: BallotInput;
  action?: "status" | "unlock";
}

function isValidGuideAccessBody(body: unknown): body is GuideAccessBody {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return (
    isValidBallotInput(value.ballotInput) &&
    (value.action === undefined ||
      value.action === "status" ||
      value.action === "unlock")
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidGuideAccessBody(body)) {
    return NextResponse.json(
      { error: "Invalid guide access payload" },
      { status: 400 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      unlocked: false,
      canUnlock: false,
      source: null,
      electionPassCredits: 0,
      powerPassRunsRemaining: 0,
      powerPassExpiresAt: null,
      requiresAuth: true,
    });
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return NextResponse.json(
      {
        error: trust.reason,
        unlocked: false,
        canUnlock: false,
        source: null,
        electionPassCredits: 0,
        powerPassRunsRemaining: 0,
        powerPassExpiresAt: null,
      },
      { status: 403 }
    );
  }

  const ballotHash = buildBallotHash(body.ballotInput);

  if (body.action === "unlock") {
    const { data, error } = await supabase.rpc("consume_guide_access", {
      p_user_id: user.id,
      p_ballot_hash: ballotHash,
      p_now: new Date().toISOString(),
    });

    if (error) {
      await recordAppEvent({
        category: "billing",
        event: "guide_unlock_failed",
        severity: "error",
        route: "/api/guide-access",
        userId: user.id,
        details: { message: error.message },
      });
      return NextResponse.json(
        { error: "Failed to unlock guide access" },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.granted) {
      const entitlements = await getCurrentEntitlements(supabase, user.id);
      return NextResponse.json(
        {
          error: "No paid unlocks are available for this ballot.",
          unlocked: false,
          canUnlock: false,
          source: null,
          electionPassCredits: entitlements.election_pass_credits,
          powerPassRunsRemaining: entitlements.power_pass_runs_remaining,
          powerPassExpiresAt: entitlements.power_pass_expires_at,
        },
        { status: 403 }
      );
    }

    await recordAppEvent({
      category: "billing",
      event: "guide_unlock_granted",
      route: "/api/guide-access",
      userId: user.id,
      details: {
        ballotHash,
        source: row.source,
        electionPassCredits: row.election_pass_credits,
        powerPassRunsRemaining: row.power_pass_runs_remaining,
      },
    });

    return NextResponse.json({
      unlocked: true,
      canUnlock: false,
      source: row.source,
      electionPassCredits: Number(row.election_pass_credits ?? 0),
      powerPassRunsRemaining: Number(row.power_pass_runs_remaining ?? 0),
      powerPassExpiresAt: row.power_pass_expires_at ?? null,
    });
  }

  const status = await getGuideAccessStatus(supabase, user, ballotHash);
  return NextResponse.json(status);
}
