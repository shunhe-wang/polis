import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSummaryForUser } from "@/lib/account";
import { DEFAULT_ACCOUNT_SUMMARY } from "@/lib/freemium";
import { getSameOriginError } from "@/lib/csrf";
import { isValidAccountDeletionConfirmation } from "@/lib/account-deletion";
import { getStripeClient } from "@/lib/stripe";
import { recordAppEvent } from "@/lib/observability";
import { getBearerAccessToken, getMobileCorsHeaders } from "@/lib/mobile-request";
import { createAccessTokenClient } from "@/lib/supabase/token";

export async function OPTIONS(request: Request) {
  const headers = getMobileCorsHeaders(request, ["GET", "DELETE"]);
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
}

export async function GET(request: NextRequest) {
  const corsHeaders = getMobileCorsHeaders(request, ["GET"]);
  const accessToken = getBearerAccessToken(request);
  if (corsHeaders) {
    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: corsHeaders }
      );
    }
    const admin = createAdminClient();
    const tokenClient = createAccessTokenClient(accessToken);
    if (!admin || !tokenClient) {
      return NextResponse.json(
        { error: "Account access is not configured" },
        { status: 503, headers: corsHeaders }
      );
    }
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: corsHeaders }
      );
    }
    return NextResponse.json(
      {
        ...(await getAccountSummaryForUser(tokenClient, data.user)),
        email: data.user.email ?? null,
      },
      { headers: corsHeaders }
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(DEFAULT_ACCOUNT_SUMMARY);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json({
    ...(await getAccountSummaryForUser(supabase, user)),
    email: user?.email ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  // The bundled iOS client authenticates with a bearer token from the
  // configured Capacitor origin; App Store Guideline 5.1.1(v) requires that
  // in-app account deletion works there too. Browser requests stay behind the
  // same-origin CSRF check.
  const corsHeaders = getMobileCorsHeaders(request, ["GET", "DELETE"]);
  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: corsHeaders ?? undefined });

  const admin = createAdminClient();
  if (!admin) {
    return respond({ error: "Account deletion is not configured" }, 503);
  }

  let user: { id: string; email?: string | null } | null = null;
  let reauthClient;

  if (corsHeaders) {
    const accessToken = getBearerAccessToken(request);
    if (!accessToken) {
      return respond({ error: "Authentication required" }, 401);
    }
    const tokenClient = createAccessTokenClient(accessToken);
    if (!tokenClient) {
      return respond({ error: "Account deletion is not configured" }, 503);
    }
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error || !data.user) {
      return respond({ error: "Authentication required" }, 401);
    }
    user = data.user;
    reauthClient = tokenClient;
  } else {
    const csrfError = getSameOriginError(request);
    if (csrfError) {
      return respond({ error: csrfError }, 403);
    }
    const supabase = await createClient();
    if (!supabase) {
      return respond({ error: "Account deletion is not configured" }, 503);
    }
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    user = sessionUser;
    reauthClient = supabase;
  }

  if (!user?.email || !reauthClient) {
    return respond({ error: "Authentication required" }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!isValidAccountDeletionConfirmation(body, user.email)) {
    return respond(
      {
        error:
          "Enter your account email, current password, and the exact phrase DELETE",
      },
      400
    );
  }

  const { error: reauthenticationError } =
    await reauthClient.auth.signInWithPassword({
      email: user.email,
      password: body.password,
    });
  if (reauthenticationError) {
    return respond({ error: "Current password is incorrect" }, 403);
  }

  // Read the Stripe linkage before the user row (and its cascades) disappear,
  // but only delete the Stripe customer after the account deletion succeeded:
  // a failed account deletion must not leave a half-deleted billing state.
  const { data: billingCustomer } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error: deletionError } = await admin.auth.admin.deleteUser(user.id);
  if (deletionError) {
    return respond(
      { error: `Could not delete account: ${deletionError.message}` },
      500
    );
  }

  let stripeCustomerDeleted = !billingCustomer?.stripe_customer_id;
  const stripe = getStripeClient();
  if (stripe && billingCustomer?.stripe_customer_id) {
    try {
      await stripe.customers.del(billingCustomer.stripe_customer_id);
      stripeCustomerDeleted = true;
    } catch (error) {
      await recordAppEvent({
        category: "account",
        event: "stripe_customer_deletion_failed",
        severity: "error",
        route: "/api/account",
        userId: user.id,
        details: {
          stripeCustomerId: billingCustomer.stripe_customer_id,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  return respond({
    deleted: true,
    stripeCustomerDeleted,
  });
}
