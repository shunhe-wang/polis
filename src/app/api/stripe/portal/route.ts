import { NextRequest, NextResponse } from "next/server";
import { getSameOriginError } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json(
      { error: csrfError },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      error:
        "Billing portal is not used for one-time Election Pass credits. Buy another credit from pricing instead.",
    },
    { status: 404 }
  );
}
