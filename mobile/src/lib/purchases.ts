import { registerPlugin } from "@capacitor/core";

export interface StoreKitProduct {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
}

export interface PurchasedTransaction {
  transactionId: string;
  signedTransaction: string;
}

export type PurchaseResult =
  | ({ status: "purchased" } & PurchasedTransaction)
  | { status: "pending" | "cancelled" };

export interface StoreKitBridge {
  getProduct(options: { productId: string }): Promise<StoreKitProduct>;
  purchase(options: {
    productId: string;
    appAccountToken: string;
  }): Promise<PurchaseResult>;
  getUnfinishedTransactions(): Promise<{ transactions: PurchasedTransaction[] }>;
  finish(options: { transactionId: string }): Promise<void>;
}

export const StoreKit = registerPlugin<StoreKitBridge>("PolisStoreKit");

interface FulfillmentResponse {
  ok: true;
  alreadyFulfilled: boolean;
  creditsGranted: number;
  electionPassCredits: number;
}

export async function fulfillPurchasedTransaction(input: {
  apiUrl: string;
  accessToken: string;
  transaction: PurchasedTransaction;
  storeKit?: StoreKitBridge;
  fetcher?: typeof fetch;
}): Promise<FulfillmentResponse> {
  const response = await (input.fetcher ?? fetch)(
    `${input.apiUrl}/api/storekit/transactions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signedTransaction: input.transaction.signedTransaction }),
    }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<FulfillmentResponse> & { error?: string })
    | null;
  if (!response.ok || body?.ok !== true) {
    throw new Error(body?.error ?? "Could not deliver this Election Pass");
  }

  await (input.storeKit ?? StoreKit).finish({
    transactionId: input.transaction.transactionId,
  });
  return body as FulfillmentResponse;
}

export async function purchaseElectionPass(input: {
  apiUrl: string;
  accessToken: string;
  productId: string;
  appAccountToken: string;
  storeKit?: StoreKitBridge;
}): Promise<FulfillmentResponse | { status: "pending" | "cancelled" }> {
  const storeKit = input.storeKit ?? StoreKit;
  const purchase = await storeKit.purchase({
    productId: input.productId,
    appAccountToken: input.appAccountToken,
  });
  if (purchase.status !== "purchased") return purchase;

  return fulfillPurchasedTransaction({
    apiUrl: input.apiUrl,
    accessToken: input.accessToken,
    transaction: purchase,
    storeKit,
  });
}

export async function retryUnfinishedTransactions(input: {
  apiUrl: string;
  accessToken: string;
  storeKit?: StoreKitBridge;
}): Promise<number> {
  const storeKit = input.storeKit ?? StoreKit;
  const { transactions } = await storeKit.getUnfinishedTransactions();
  let delivered = 0;
  for (const transaction of transactions) {
    await fulfillPurchasedTransaction({ ...input, transaction, storeKit });
    delivered += 1;
  }
  return delivered;
}
