import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProductConfig, getProductPriceId } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";
import { getAccountTrustStatus } from "@/lib/account-trust";
import { getSameOriginError } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json(
      { error: csrfError },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const stripe = getStripeClient();

  const body = await request.json().catch(() => null);
  const productKey =
    body &&
    typeof body === "object" &&
    typeof body.productKey === "string"
      ? body.productKey
      : "election_pass";
  const product = getProductConfig(productKey);
  const priceId = product ? getProductPriceId(product.key) : null;

  if (!supabase || !stripe || !priceId || !product) {
    return NextResponse.json(
      { error: "This paid product is not configured" },
      { status: product ? 503 : 400 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const trust = getAccountTrustStatus(user);
  if (!trust.trusted) {
    return NextResponse.json(
      { error: trust.reason },
      { status: 403 }
    );
  }

  const { data: customer } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let stripeCustomerId = customer?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    const createdCustomer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    stripeCustomerId = createdCustomer.id;

    const { error } = await supabase.from("billing_customers").upsert(
      {
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return NextResponse.json(
        { error: `Failed to persist Stripe customer: ${error.message}` },
        { status: 500 }
      );
    }
  }

  const origin = request.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    allow_promotion_codes: true,
    metadata: {
      user_id: user.id,
      product_key: product.key,
    },
  });

  return NextResponse.json({ url: session.url });
}
