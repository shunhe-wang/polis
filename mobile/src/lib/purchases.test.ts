import { describe, expect, it, vi } from "vitest";
import { fulfillPurchasedTransaction, type StoreKitBridge } from "./purchases";

function bridge(): StoreKitBridge {
  return {
    getProduct: vi.fn(),
    purchase: vi.fn(),
    getUnfinishedTransactions: vi.fn(),
    finish: vi.fn().mockResolvedValue(undefined),
  };
}

describe("StoreKit fulfillment", () => {
  it("finishes a transaction only after the API confirms delivery", async () => {
    const storeKit = bridge();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, electionPassCredits: 2 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await fulfillPurchasedTransaction({
      apiUrl: "https://polis.example",
      accessToken: "access-token",
      transaction: {
        transactionId: "123",
        signedTransaction: "header.payload.signature",
      },
      storeKit,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://polis.example/api/storekit/transactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      })
    );
    expect(storeKit.finish).toHaveBeenCalledWith({ transactionId: "123" });
    expect(result.electionPassCredits).toBe(2);
  });

  it("leaves the transaction unfinished when delivery fails", async () => {
    const storeKit = bridge();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      fulfillPurchasedTransaction({
        apiUrl: "https://polis.example",
        accessToken: "access-token",
        transaction: {
          transactionId: "123",
          signedTransaction: "header.payload.signature",
        },
        storeKit,
        fetcher,
      })
    ).rejects.toThrow("temporarily unavailable");
    expect(storeKit.finish).not.toHaveBeenCalled();
  });
});
