import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccountSummaryForUser } from "@/lib/account";
import { DEFAULT_ACCOUNT_SUMMARY } from "@/lib/freemium";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(DEFAULT_ACCOUNT_SUMMARY);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(await getAccountSummaryForUser(supabase, user));
}
