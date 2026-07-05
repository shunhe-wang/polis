import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock, recordEventMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  recordEventMock: vi.fn(),
}));

vi.mock("@/lib/ballot-sources/google-civic", () => ({
  lookupGoogleCivicBallot: lookupMock,
}));

vi.mock("@/lib/observability", () => ({
  recordAppEvent: recordEventMock,
}));

import { GET } from "./route";

describe("election-data freshness cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.ELECTION_FRESHNESS_PROBE_ADDRESS = "1 Public Square, Albany, NY";
    lookupMock.mockResolvedValue({
      state: "NY",
      election: {
        id: "2026-general",
        name: "2026 General Election",
        electionDay: "2026-11-03",
      },
      availableElections: [],
      requiresElectionSelection: false,
      primaryParties: [],
      races: [{ id: "race-1" }],
      measures: [],
      error: null,
      resolvedAddress: "1 Public Square, Albany, NY",
      locality: null,
    });
    recordEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.ELECTION_FRESHNESS_PROBE_ADDRESS;
  });

  it("probes the official election-data path without logging the address", async () => {
    const response = await GET(
      new Request("https://polis.example/api/cron/election-data-freshness", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      hasBallot: true,
      raceCount: 1,
      measureCount: 0,
    });
    expect(lookupMock).toHaveBeenCalledWith({
      address: "1 Public Square, Albany, NY",
    });
    expect(recordEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "election_data",
        event: "election_data_probe_succeeded",
        route: "/api/cron/election-data-freshness",
        details: expect.not.objectContaining({ address: expect.anything() }),
      })
    );
  });

  it("rejects requests when the cron secret is missing or incorrect", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new Request("https://polis.example/api/cron/election-data-freshness", {
        headers: { authorization: "Bearer undefined" },
      })
    );

    expect(response.status).toBe(401);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(recordEventMock).not.toHaveBeenCalled();
  });

  it("reports a reachable but empty ballot source as degraded", async () => {
    lookupMock.mockResolvedValue({
      state: null,
      election: null,
      availableElections: [],
      requiresElectionSelection: false,
      primaryParties: [],
      races: [],
      measures: [],
      error: "No upcoming elections found",
      resolvedAddress: "1 Public Square, Albany, NY",
      locality: null,
    });

    const response = await GET(
      new Request("https://polis.example/api/cron/election-data-freshness", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "degraded",
      hasBallot: false,
    });
    expect(recordEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "election_data_probe_degraded",
        severity: "warning",
      })
    );
  });
});
