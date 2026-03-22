import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserTierForEmail } from "@/lib/account";
import {
  getStarterAnalysisLimit,
  getStarterAnalysisRemaining,
} from "@/lib/ai-quotas";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({
      tier: "guest",
      isAuthenticated: false,
      starterAnalysesRemaining: 0,
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      tier: "guest",
      isAuthenticated: false,
      starterAnalysesRemaining: 0,
    });
  }

  const tier = getUserTierForEmail(user.email);
  const starterAnalysesRemaining =
    tier === "free"
      ? await getStarterAnalysisRemaining(supabase)
      : tier === "pro"
        ? getStarterAnalysisLimit()
        : 0;

  return NextResponse.json({
    tier,
    isAuthenticated: true,
    starterAnalysesRemaining,
  });
}
