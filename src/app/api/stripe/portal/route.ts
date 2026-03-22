import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Billing portal is not used for one-time election passes. Buy another pass from pricing instead.",
    },
    { status: 404 }
  );
}
