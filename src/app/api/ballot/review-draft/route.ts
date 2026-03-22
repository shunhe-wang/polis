import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTrustStatus } from "@/lib/account-trust";
import {
  enforceQuotaRules,
  getBallotParseQuotaRules,
} from "@/lib/ai-quotas";
import { parseBallotReviewDraft } from "@/lib/anthropic";
import { buildScopedIpQuotaRules } from "@/lib/request-identity";
import { isValidBallotReviewDraft } from "@/lib/validation";
import type {
  BallotInput,
  BallotImportMeta,
  BallotReviewDraft,
  Race,
  BallotMeasure,
  BallotElectionContext,
} from "@/lib/types";

interface ReviewDraftBody {
  ballotText: string;
  state?: string | null;
}

interface PersistedDraftResponse {
  draft: BallotReviewDraft;
  normalizedBallot: BallotInput;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isValidBody(body: unknown): body is ReviewDraftBody {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return (
    typeof value.ballotText === "string" &&
    value.ballotText.trim().length >= 40 &&
    value.ballotText.trim().length <= 30_000 &&
    (value.state === undefined ||
      value.state === null ||
      typeof value.state === "string")
  );
}

function withIds(draft: BallotReviewDraft, state: string | null): BallotInput {
  const election: BallotElectionContext | null =
    draft.election && draft.election.name
      ? {
          id: crypto.randomUUID(),
          name: draft.election.name,
          electionDay:
            draft.election.electionDay ?? new Date().toISOString().slice(0, 10),
          kind: draft.election.kind ?? "other",
          selectedParty: draft.election.selectedParty,
        }
      : null;

  const races: Race[] = draft.races.map((race) => ({
    id: crypto.randomUUID(),
    name: race.name,
    level: race.level,
    contestType: race.contestType ?? undefined,
    candidates: race.candidates.map((candidate) => ({
      id: crypto.randomUUID(),
      name: candidate.name,
      party: candidate.party,
    })),
  }));

  const measures: BallotMeasure[] = draft.measures.map((measure) => ({
    id: crypto.randomUUID(),
    title: measure.title,
    description: measure.description,
    type: measure.type,
  }));

  const importMeta: BallotImportMeta = {
    importId: null,
    source: "official_upload",
    status:
      races.length > 0 || measures.length > 0
        ? measures.length > 0
          ? "complete"
          : "partial"
        : "unavailable",
    confidence: draft.confidence,
    message:
      "Parsed from pasted ballot text. Review candidate names, parties, and measures before continuing.",
    fallbackLinks: [],
    locality: {
      city: null,
      county: null,
      state,
      zip: null,
    },
  };

  return {
    address: "",
    state: state ?? "",
    election,
    importMeta,
    races,
    measures,
  };
}

export async function POST(request: NextRequest) {
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

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use ballot text parsing." },
      { status: 401 }
    );
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return NextResponse.json(
      { error: trust.reason ?? "This account cannot use ballot parsing yet." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Paste more ballot text before parsing." },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  try {
    const quotaFailure = await enforceQuotaRules(
      admin ?? supabase,
      [
        ...getBallotParseQuotaRules().map((rule) => ({
          rule,
          incrementBy: 1,
        })),
        ...buildScopedIpQuotaRules(request, getBallotParseQuotaRules()),
      ]
    );

    if (quotaFailure) {
      return NextResponse.json(
        {
          error:
            "Ballot text parsing is rate limited right now. Try again in a few minutes.",
        },
        { status: 429 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to enforce ballot parsing quota",
      },
      { status: 503 }
    );
  }

  try {
    const draft = await parseBallotReviewDraft({
      ballotText: body.ballotText,
      state: body.state ?? null,
    });

    if (!isValidBallotReviewDraft(draft)) {
      return NextResponse.json(
        { error: "Parsed ballot draft was invalid" },
        { status: 502 }
      );
    }

    const normalizedBallot = withIds(draft, body.state ?? null);
    const textHash = hashText(body.ballotText.trim());

    await supabase.from("ballot_review_drafts").upsert(
      {
        user_id: user.id,
        source: "pasted_text",
        text_hash: textHash,
        raw_text: body.ballotText.trim(),
        parsed_ballot: normalizedBallot,
        confidence: draft.confidence,
        notes: draft.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,text_hash" }
    );

    return NextResponse.json({
      draft,
      normalizedBallot,
    } satisfies PersistedDraftResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse ballot draft",
      },
      { status: 502 }
    );
  }
}

export async function GET() {
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

  if (!user) {
    return NextResponse.json({ draft: null, normalizedBallot: null });
  }

  const { data } = await supabase
    .from("ballot_review_drafts")
    .select("parsed_ballot, confidence, notes")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ draft: null, normalizedBallot: null });
  }

  const normalizedBallot = data.parsed_ballot as BallotInput;
  const draft: BallotReviewDraft = {
    election: normalizedBallot.election
      ? {
          name: normalizedBallot.election.name,
          electionDay: normalizedBallot.election.electionDay,
          kind: normalizedBallot.election.kind,
          selectedParty: normalizedBallot.election.selectedParty,
        }
      : null,
    races: normalizedBallot.races.map((race) => ({
      name: race.name,
      level: race.level,
      contestType: race.contestType ?? null,
      candidates: race.candidates.map((candidate) => ({
        name: candidate.name,
        party: candidate.party,
      })),
    })),
    measures: normalizedBallot.measures.map((measure) => ({
      title: measure.title,
      description: measure.description,
      type: measure.type,
    })),
    confidence:
      typeof data.confidence === "number" ? data.confidence : 50,
    notes: Array.isArray(data.notes)
      ? data.notes.filter((note): note is string => typeof note === "string")
      : [],
  };

  return NextResponse.json({
    draft,
    normalizedBallot,
  } satisfies PersistedDraftResponse);
}
