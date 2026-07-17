import { getAccountTrustStatus } from "@/lib/account-trust";
import { normalizeAppStoreTransaction } from "@/lib/app-store";
import { verifyAppStoreTransaction } from "@/lib/app-store-verification";
import { getSameOriginError } from "@/lib/csrf";
import { recordAppEvent } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { getBearerAccessToken, getMobileCorsHeaders } from "@/lib/mobile-request";

export const runtime = "nodejs";

const ROUTE = "/api/storekit/transactions";

export async function OPTIONS(request: Request) {
  const headers = getMobileCorsHeaders(request, ["POST"]);
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const corsHeaders = getMobileCorsHeaders(request, ["POST"]);
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: corsHeaders ?? undefined });
  const csrfError = corsHeaders ? null : getSameOriginError(request);
  if (csrfError) {
    return respond({ error: csrfError }, 403);
  }

  const body = await request.json().catch(() => null);
  const signedTransaction =
    body &&
    typeof body === "object" &&
    "signedTransaction" in body &&
    typeof body.signedTransaction === "string"
      ? body.signedTransaction.trim()
      : "";
  if (
    !signedTransaction ||
    signedTransaction.length > 50_000 ||
    signedTransaction.split(".").length !== 3
  ) {
    return respond({ error: "A valid signed App Store transaction is required" }, 400);
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!admin) {
    return respond({ error: "Purchase verification is not configured" }, 503);
  }

  const accessToken = getBearerAccessToken(request);
  let user: User | null = null;
  if (accessToken) {
    const result = await admin.auth.getUser(accessToken);
    user = result.data.user;
  } else if (supabase) {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  }
  if (!user?.email) {
    return respond({ error: "Authentication required" }, 401);
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    // At this point StoreKit has already charged the customer, so a blocked
    // fulfillment must be loudly visible for manual reconciliation.
    await recordAppEvent({
      category: "billing",
      event: "app_store_transaction_failed",
      severity: "error",
      route: ROUTE,
      userId: user.id,
      details: {
        message: "Paid App Store transaction blocked by the account trust gate",
        reason: trust.reason,
      },
    });
    return respond({ error: trust.reason }, 403);
  }

  const productId = process.env.APP_STORE_PRODUCT_ELECTION_PASS?.trim();
  if (!productId) {
    return respond({ error: "The App Store product is not configured" }, 503);
  }

  try {
    const payload = await verifyAppStoreTransaction(signedTransaction);
    const transaction = normalizeAppStoreTransaction(payload, {
      userId: user.id,
      electionPassProductId: productId,
    });
    const { data, error } = await admin.rpc("fulfill_app_store_transaction", {
      p_user_id: user.id,
      p_transaction_id: transaction.transactionId,
      p_original_transaction_id: transaction.originalTransactionId,
      p_app_account_token: transaction.appAccountToken,
      p_product_id: transaction.productId,
      p_product_key: transaction.productKey,
      p_environment: transaction.environment,
      p_purchase_date: transaction.purchaseDate,
      p_quantity: transaction.quantity,
      p_now: new Date().toISOString(),
    });
    if (error) {
      const fulfillmentError = new Error(
        `App Store fulfillment failed: ${error.message}`
      );
      fulfillmentError.name = "AppStoreFulfillmentError";
      throw fulfillmentError;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const alreadyFulfilled = Boolean(result?.already_fulfilled);
    const electionPassCredits = Number(result?.election_pass_credits ?? 0);

    await recordAppEvent({
      category: "billing",
      event: alreadyFulfilled
        ? "app_store_transaction_duplicate"
        : "app_store_transaction_fulfilled",
      route: ROUTE,
      userId: user.id,
      details: {
        transactionId: transaction.transactionId,
        productId: transaction.productId,
        environment: transaction.environment,
        quantity: transaction.quantity,
      },
    });

    return respond({
      ok: true,
      alreadyFulfilled,
      creditsGranted: alreadyFulfilled ? 0 : transaction.creditsGranted,
      electionPassCredits,
    });
  } catch (error) {
    const configurationFailure =
      error instanceof Error && error.name === "AppStoreConfigurationError";
    const fulfillmentFailure =
      error instanceof Error && error.name === "AppStoreFulfillmentError";
    await recordAppEvent({
      category: "billing",
      event: "app_store_transaction_failed",
      severity: "error",
      route: ROUTE,
      userId: user.id,
      details: {
        message: configurationFailure
          ? "App Store verification is not configured"
          : fulfillmentFailure
            ? "Verified App Store transaction could not be fulfilled"
            : "App Store transaction verification failed",
      },
    });
    return respond(
      {
        error: configurationFailure
          ? "App Store verification is not configured"
          : fulfillmentFailure
            ? "Purchase was verified but could not be fulfilled"
          : "Could not verify or fulfill this App Store purchase",
      },
      configurationFailure ? 503 : fulfillmentFailure ? 500 : 400
    );
  }
}
