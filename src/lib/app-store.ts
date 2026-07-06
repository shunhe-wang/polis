import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";

export interface AppStoreFulfillmentTransaction {
  transactionId: string;
  originalTransactionId: string;
  appAccountToken: string;
  productId: string;
  productKey: "election_pass";
  environment: string;
  purchaseDate: string;
  quantity: number;
  creditsGranted: number;
}

interface AppStoreTransactionContext {
  userId: string;
  electionPassProductId: string;
}

export function normalizeAppStoreTransaction(
  payload: JWSTransactionDecodedPayload,
  context: AppStoreTransactionContext
): AppStoreFulfillmentTransaction {
  if (!payload.transactionId || !payload.originalTransactionId) {
    throw new Error("App Store transaction identifiers are missing");
  }
  if (payload.productId !== context.electionPassProductId) {
    throw new Error("App Store product is not configured");
  }
  if (
    !payload.appAccountToken ||
    payload.appAccountToken.toLowerCase() !== context.userId.toLowerCase()
  ) {
    throw new Error("App Store transaction belongs to a different account");
  }
  if (payload.type !== "Consumable") {
    throw new Error("App Store transaction is not a consumable purchase");
  }
  if (payload.revocationDate !== undefined) {
    throw new Error("App Store transaction was revoked");
  }

  const quantity = payload.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error("App Store transaction quantity is invalid");
  }
  if (!payload.environment || !payload.purchaseDate) {
    throw new Error("App Store transaction metadata is incomplete");
  }

  const purchaseDate = new Date(payload.purchaseDate);
  if (Number.isNaN(purchaseDate.getTime())) {
    throw new Error("App Store purchase date is invalid");
  }

  return {
    transactionId: payload.transactionId,
    originalTransactionId: payload.originalTransactionId,
    appAccountToken: payload.appAccountToken.toLowerCase(),
    productId: payload.productId,
    productKey: "election_pass",
    environment: payload.environment,
    purchaseDate: purchaseDate.toISOString(),
    quantity,
    creditsGranted: quantity,
  };
}
