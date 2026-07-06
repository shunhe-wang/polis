import { getAccountTrustStatus } from "@/lib/account-trust";
import { normalizeAppStoreTransaction } from "@/lib/app-store";
import { verifyAppStoreTransaction } from "@/lib/app-store-verification";
import { getSameOriginError } from "@/lib/csrf";
import { recordAppEvent } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ROUTE = "/api/storekit/transactions";

export async function POST(request: Request) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return Response.json({ error: csrfError }, { status: 403 });
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
    return Response.json(
      { error: "A valid signed App Store transaction is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return Response.json(
      { error: "Purchase verification is not configured" },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return Response.json({ error: trust.reason }, { status: 403 });
  }

  const productId = process.env.APP_STORE_PRODUCT_ELECTION_PASS?.trim();
  if (!productId) {
    return Response.json(
      { error: "The App Store product is not configured" },
      { status: 503 }
    );
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

    return Response.json({
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
    return Response.json(
      {
        error: configurationFailure
          ? "App Store verification is not configured"
          : fulfillmentFailure
            ? "Purchase was verified but could not be fulfilled"
          : "Could not verify or fulfill this App Store purchase",
      },
      { status: configurationFailure ? 503 : fulfillmentFailure ? 500 : 400 }
    );
  }
}
