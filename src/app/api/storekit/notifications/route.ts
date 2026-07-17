import {
  verifyAppStoreNotification,
  verifyAppStoreTransaction,
} from "@/lib/app-store-verification";
import { recordAppEvent } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ROUTE = "/api/storekit/notifications";

// Notification types that revoke a previously delivered purchase.
const REVOCATION_TYPES = new Set(["REFUND", "REVOKE"]);

// App Store Server Notifications V2. Apple authenticates itself with the
// signed JWS payload; signature verification is the auth gate. Apple retries
// delivery on any non-2xx response.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const signedPayload =
    body &&
    typeof body === "object" &&
    "signedPayload" in body &&
    typeof body.signedPayload === "string"
      ? body.signedPayload.trim()
      : "";
  if (
    !signedPayload ||
    signedPayload.length > 100_000 ||
    signedPayload.split(".").length !== 3
  ) {
    return Response.json(
      { error: "A signed App Store notification payload is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: "Notification handling is not configured" },
      { status: 503 }
    );
  }

  let notification;
  try {
    notification = await verifyAppStoreNotification(signedPayload);
  } catch {
    await recordAppEvent({
      category: "billing",
      event: "app_store_notification_rejected",
      severity: "warning",
      route: ROUTE,
      details: { message: "Notification signature verification failed" },
    });
    return Response.json(
      { error: "Could not verify the App Store notification" },
      { status: 400 }
    );
  }

  const notificationType = notification.notificationType ?? "UNKNOWN";

  if (!REVOCATION_TYPES.has(notificationType)) {
    await recordAppEvent({
      category: "billing",
      event: "app_store_notification_received",
      route: ROUTE,
      details: {
        notificationType,
        subtype: notification.subtype ?? null,
      },
    });
    return Response.json({ ok: true });
  }

  const signedTransactionInfo = notification.data?.signedTransactionInfo;
  if (typeof signedTransactionInfo !== "string" || !signedTransactionInfo) {
    await recordAppEvent({
      category: "billing",
      event: "app_store_notification_rejected",
      severity: "warning",
      route: ROUTE,
      details: {
        notificationType,
        message: "Revocation notification carried no transaction payload",
      },
    });
    return Response.json({ ok: true });
  }

  try {
    const transaction = await verifyAppStoreTransaction(signedTransactionInfo);
    if (!transaction.transactionId) {
      throw new Error("Transaction identifier is missing");
    }

    const revocationDate =
      typeof transaction.revocationDate === "number"
        ? new Date(transaction.revocationDate).toISOString()
        : null;

    const { data, error } = await admin.rpc("revoke_app_store_transaction", {
      p_transaction_id: transaction.transactionId,
      p_revocation_date: revocationDate,
      p_reason: notificationType,
    });
    if (error) {
      throw new Error(`Revocation failed: ${error.message}`);
    }

    const result = Array.isArray(data) ? data[0] : data;
    await recordAppEvent({
      category: "billing",
      event: "app_store_transaction_revoked",
      severity: "warning",
      route: ROUTE,
      details: {
        notificationType,
        transactionId: transaction.transactionId,
        foundTransaction: Boolean(result?.found_transaction),
        alreadyRevoked: Boolean(result?.already_revoked),
        creditsRevoked: Number(result?.credits_revoked ?? 0),
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    await recordAppEvent({
      category: "billing",
      event: "app_store_notification_failed",
      severity: "error",
      route: ROUTE,
      details: {
        notificationType,
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
    // Non-2xx makes Apple retry, which is what we want for transient failures.
    return Response.json({ error: "Could not process the notification" }, {
      status: 500,
    });
  }
}
