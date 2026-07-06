import { describe, expect, it } from "vitest";
import { normalizeAppStoreTransaction } from "./app-store";

describe("App Store transaction fulfillment", () => {
  it("normalizes a verified consumable purchase for its bound account", () => {
    const transaction = normalizeAppStoreTransaction(
      {
        transactionId: "2000001234567890",
        originalTransactionId: "2000001234567890",
        productId: "com.ateliersw.polis.election_pass",
        appAccountToken: "11111111-1111-4111-8111-111111111111",
        type: "Consumable",
        environment: "Sandbox",
        purchaseDate: Date.parse("2026-07-06T12:00:00.000Z"),
        quantity: 1,
      },
      {
        userId: "11111111-1111-4111-8111-111111111111",
        electionPassProductId: "com.ateliersw.polis.election_pass",
      }
    );

    expect(transaction).toEqual({
      transactionId: "2000001234567890",
      originalTransactionId: "2000001234567890",
      appAccountToken: "11111111-1111-4111-8111-111111111111",
      productId: "com.ateliersw.polis.election_pass",
      productKey: "election_pass",
      environment: "Sandbox",
      purchaseDate: "2026-07-06T12:00:00.000Z",
      quantity: 1,
      creditsGranted: 1,
    });
  });

  it("rejects a transaction bound to a different app account", () => {
    expect(() =>
      normalizeAppStoreTransaction(
        {
          transactionId: "2000001234567890",
          originalTransactionId: "2000001234567890",
          productId: "com.ateliersw.polis.election_pass",
          appAccountToken: "22222222-2222-4222-8222-222222222222",
          type: "Consumable",
          environment: "Sandbox",
          purchaseDate: Date.now(),
        },
        {
          userId: "11111111-1111-4111-8111-111111111111",
          electionPassProductId: "com.ateliersw.polis.election_pass",
        }
      )
    ).toThrow("belongs to a different account");
  });

  it("rejects revoked and non-consumable transactions", () => {
    const context = {
      userId: "11111111-1111-4111-8111-111111111111",
      electionPassProductId: "com.ateliersw.polis.election_pass",
    };
    const transaction = {
      transactionId: "2000001234567890",
      originalTransactionId: "2000001234567890",
      productId: "com.ateliersw.polis.election_pass",
      appAccountToken: "11111111-1111-4111-8111-111111111111",
      environment: "Sandbox",
      purchaseDate: Date.now(),
    };

    expect(() =>
      normalizeAppStoreTransaction(
        { ...transaction, type: "Non-Consumable" },
        context
      )
    ).toThrow("not a consumable");
    expect(() =>
      normalizeAppStoreTransaction(
        { ...transaction, type: "Consumable", revocationDate: Date.now() },
        context
      )
    ).toThrow("was revoked");
  });
});
