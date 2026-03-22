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

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  if (stripeCustomerId) {
    await admin.from("billing_customers").upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  const { error: orderError } = await admin.from("billing_orders").upsert(
    {
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      product_key: productKey,
      quantity: 1,
      amount_total: session.amount_total,
      currency: session.currency,
      status: session.payment_status ?? "completed",
      metadata: session.metadata ?? {},
      purchased_at: new Date().toISOString(),
    },
    { onConflict: "stripe_checkout_session_id" }
  );

  if (orderError) {
    throw new Error(`Failed to persist billing order: ${orderError.message}`);
  }

  const { error: entitlementError } = await admin.rpc(
    "grant_billing_entitlement",
    {
      p_user_id: userId,
      p_product_key: productKey,
      p_now: new Date().toISOString(),
    }
  );

  if (entitlementError) {
    throw new Error(
      `Failed to grant billing entitlement: ${entitlementError.message}`
    );
  }

  await recordAppEvent({
    category: "billing",
    event: "checkout_completed",
    route: "/api/stripe/webhook",
    userId,
    details: {
      checkoutSessionId: session.id,
      productKey,
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
