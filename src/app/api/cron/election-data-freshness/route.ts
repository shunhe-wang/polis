import { lookupGoogleCivicBallot } from "@/lib/ballot-sources/google-civic";
import { recordAppEvent } from "@/lib/observability";

export const maxDuration = 60;

const ROUTE = "/api/cron/election-data-freshness";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const address = process.env.ELECTION_FRESHNESS_PROBE_ADDRESS?.trim();
  if (!address) {
    await recordAppEvent({
      category: "election_data",
      event: "election_data_probe_skipped",
      severity: "warning",
      route: ROUTE,
      details: { message: "Election-data probe address is not configured" },
    });
    return Response.json(
      { error: "Election-data probe address is not configured" },
      { status: 503 }
    );
  }

  const startedAt = Date.now();
  try {
    const result = await lookupGoogleCivicBallot({ address });
    const hasBallot = result.races.length > 0 || result.measures.length > 0;
    const status = hasBallot ? "healthy" : "degraded";
    const details = {
      durationMs: Date.now() - startedAt,
      state: result.state,
      electionId: result.election?.id ?? null,
      electionDay: result.election?.electionDay ?? null,
      raceCount: result.races.length,
      measureCount: result.measures.length,
      availableElectionCount: result.availableElections.length,
      requiresElectionSelection: result.requiresElectionSelection,
      hasBallot,
    };

    await recordAppEvent({
      category: "election_data",
      event: hasBallot
        ? "election_data_probe_succeeded"
        : "election_data_probe_degraded",
      severity: hasBallot ? "info" : "warning",
      route: ROUTE,
      details,
    });

    return Response.json({ ok: true, status, ...details });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Election-data probe failed";
    await recordAppEvent({
      category: "election_data",
      event: "election_data_probe_failed",
      severity: "error",
      route: ROUTE,
      details: {
        durationMs: Date.now() - startedAt,
        message,
      },
    });
    return Response.json({ error: message }, { status: 502 });
  }
}
