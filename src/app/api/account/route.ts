import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountSummaryForUser } from "@/lib/account";
import { DEFAULT_ACCOUNT_SUMMARY } from "@/lib/freemium";
import { getSameOriginError } from "@/lib/csrf";
import { isValidAccountDeletionConfirmation } from "@/lib/account-deletion";
import { getStripeClient } from "@/lib/stripe";
import { recordAppEvent } from "@/lib/observability";

export async function GET() {
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
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json({ error: csrfError }, { status: 403 });
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return NextResponse.json(
      { error: "Account deletion is not configured" },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!isValidAccountDeletionConfirmation(body, user.email)) {
    return NextResponse.json(
      {
        error:
          "Enter your account email, current password, and the exact phrase DELETE",
      },
      { status: 400 }
    );
  }

  const { error: reauthenticationError } =
    await supabase.auth.signInWithPassword({
      email: user.email,
      password: body.password,
    });
  if (reauthenticationError) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 403 }
    );
  }

  const { data: billingCustomer } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

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

  const { error: deletionError } = await admin.auth.admin.deleteUser(user.id);
  if (deletionError) {
    return NextResponse.json(
      { error: `Could not delete account: ${deletionError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    deleted: true,
    stripeCustomerDeleted,
  });
}
