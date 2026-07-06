import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  rpcMock,
  verifyTransactionMock,
  recordEventMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  verifyTransactionMock: vi.fn(),
  recordEventMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({ auth: { getUser: getUserMock } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

vi.mock("@/lib/app-store-verification", () => ({
  verifyAppStoreTransaction: verifyTransactionMock,
}));

vi.mock("@/lib/observability", () => ({
  recordAppEvent: recordEventMock,
}));

import { POST } from "./route";

describe("StoreKit transaction API", () => {
  beforeEach(() => {
    process.env.APP_STORE_PRODUCT_ELECTION_PASS =
      "com.ateliersw.polis.election_pass";
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "buyer@example.com",
          email_confirmed_at: "2026-07-01T12:00:00.000Z",
        },
      },
    });
    verifyTransactionMock.mockResolvedValue({
      transactionId: "2000001234567890",
      originalTransactionId: "2000001234567890",
      productId: "com.ateliersw.polis.election_pass",
      appAccountToken: "11111111-1111-4111-8111-111111111111",
      type: "Consumable",
      environment: "Sandbox",
      purchaseDate: Date.parse("2026-07-06T12:00:00.000Z"),
      quantity: 1,
    });
    rpcMock.mockResolvedValue({
      data: [{ already_fulfilled: false, election_pass_credits: 2 }],
      error: null,
    });
    recordEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_STORE_PRODUCT_ELECTION_PASS;
  });

  it("verifies and atomically fulfills a purchase for the signed-in account", async () => {
    const response = await POST(
      new Request("https://polis.example/api/storekit/transactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://polis.example",
        },
        body: JSON.stringify({ signedTransaction: "header.payload.signature" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      alreadyFulfilled: false,
      creditsGranted: 1,
      electionPassCredits: 2,
    });
    expect(rpcMock).toHaveBeenCalledWith("fulfill_app_store_transaction", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_transaction_id: "2000001234567890",
      p_original_transaction_id: "2000001234567890",
      p_app_account_token: "11111111-1111-4111-8111-111111111111",
      p_product_id: "com.ateliersw.polis.election_pass",
      p_product_key: "election_pass",
      p_environment: "Sandbox",
      p_purchase_date: "2026-07-06T12:00:00.000Z",
      p_quantity: 1,
      p_now: expect.any(String),
    });
  });

  it("returns a successful no-op when Apple retries the same transaction", async () => {
    rpcMock.mockResolvedValue({
      data: [{ already_fulfilled: true, election_pass_credits: 2 }],
      error: null,
    });

    const response = await POST(
      new Request("https://polis.example/api/storekit/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTransaction: "header.payload.signature" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      alreadyFulfilled: true,
      creditsGranted: 0,
      electionPassCredits: 2,
    });
  });

  it("reports a server error when atomic fulfillment fails", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    const response = await POST(
      new Request("https://polis.example/api/storekit/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTransaction: "header.payload.signature" }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Purchase was verified but could not be fulfilled",
    });
  });
});
