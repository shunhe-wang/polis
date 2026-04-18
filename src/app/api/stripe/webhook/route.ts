import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProductConfig } from "@/lib/billing";
import { recordAppEvent } from "@/lib/observability";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase service role is not configured");
  }

  const userId =
    typeof session.metadata?.user_id === "string"
      ? session.metadata.user_id
      : null;
  const productKey =
    typeof session.metadata?.product_key === "string"
      ? session.metadata.product_key
      : null;

  if (!userId || !productKey || !getProductConfig(productKey)) {
    throw new Error("Checkout session is missing a valid user or product");
  }

  const quantity =
    Array.isArray(session.line_items?.data) &&
    typeof session.line_items.data[0]?.quantity === "number"
      ? session.line_items.data[0].quantity
      : typeof session.metadata?.quantity === "string"
        ? Number.parseInt(session.metadata.quantity, 10) || 1
      : 1;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const purchasedAt =
    typeof session.created === "number"
      ? new Date(session.created * 1000).toISOString()
      : new Date().toISOString();
  const { data: fulfillmentRows, error: fulfillmentError } = await admin.rpc(
    "fulfill_billing_checkout",
    {
      p_user_id: userId,
      p_stripe_checkout_session_id: session.id,
      p_stripe_customer_id: stripeCustomerId,
      p_stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      p_product_key: productKey,
      p_quantity: quantity,
      p_amount_total: session.amount_total,
      p_currency: session.currency,
      p_status: session.payment_status ?? "completed",
      p_metadata: session.metadata ?? {},
      p_purchased_at: purchasedAt,
      p_now: new Date().toISOString(),
    }
  );

  if (fulfillmentError) {
    throw new Error(
      `Failed to fulfill billing checkout: ${fulfillmentError.message}`
    );
  }

  const fulfillment = Array.isArray(fulfillmentRows)
    ? fulfillmentRows[0]
    : fulfillmentRows;
  const duplicate =
    !!fulfillment &&
    typeof fulfillment === "object" &&
    "already_fulfilled" in fulfillment &&
    Boolean(fulfillment.already_fulfilled);

  await recordAppEvent({
    category: "billing",
    event: duplicate ? "checkout_completed_duplicate" : "checkout_completed",
    route: "/api/stripe/webhook",
    userId,
    details: {
      checkoutSessionId: session.id,
      productKey,
      quantity,
      amountTotal: session.amount_total,
      currency: session.currency,
    },
  });
}

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 }
    );
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid Stripe signature",
      },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
    }
  } catch (error) {
    await recordAppEvent({
      category: "billing",
      event: "webhook_failed",
      severity: "error",
      route: "/api/stripe/webhook",
      details: {
        eventType: event.type,
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Webhook handling failed",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
