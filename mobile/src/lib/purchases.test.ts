import { describe, expect, it, vi } from "vitest";
import {
  fulfillPurchasedTransaction,
  retryUnfinishedTransactions,
  type StoreKitBridge,
} from "./purchases";

function bridge(): StoreKitBridge {
  return {
    getProduct: vi.fn(),
    purchase: vi.fn(),
    getUnfinishedTransactions: vi.fn(),
    finish: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(),
  };
}

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true, electionPassCredits: 2 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function rejectedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "belongs to a different account" }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
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

  it("still reports success when finish fails after delivery", async () => {
    const storeKit = bridge();
    storeKit.finish = vi.fn().mockRejectedValue(new Error("bridge error"));
    const fetcher = vi.fn().mockResolvedValue(okResponse());

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

    expect(result.electionPassCredits).toBe(2);
  });

  it("delivers later transactions when an earlier one is rejected", async () => {
    const storeKit = bridge();
    storeKit.getUnfinishedTransactions = vi.fn().mockResolvedValue({
      transactions: [
        { transactionId: "1", signedTransaction: "a.b.c" },
        { transactionId: "2", signedTransaction: "d.e.f" },
      ],
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(rejectedResponse())
      .mockResolvedValueOnce(okResponse());

    const delivered = await retryUnfinishedTransactions({
      apiUrl: "https://polis.example",
      accessToken: "access-token",
      storeKit,
      fetcher,
    });

    expect(delivered).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(storeKit.finish).toHaveBeenCalledWith({ transactionId: "2" });
    expect(storeKit.finish).not.toHaveBeenCalledWith({ transactionId: "1" });
  });
});
