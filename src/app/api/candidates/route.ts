import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface CandidateLookupResult {
  candidates: Array<{ name: string; party: string | null }>;
  error: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.raceName !== "string" ||
    !body.raceName.trim()
  ) {
    return NextResponse.json(
      { error: "raceName is required", candidates: [] },
      { status: 400 }
    );
  }

  const raceName: string = body.raceName.trim();
  const state: string = body.state?.trim() ?? "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await anthropic.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        tools: [
          {
            type: "web_search_20250305" as const,
            name: "web_search" as const,
            max_uses: 2,
          },
        ],
        messages: [
          {
            role: "user",
            content: `List candidates for "${raceName}"${state ? ` in ${state}` : ""}. Search the web, then reply with ONLY a JSON array: [{"name":"...","party":"..."}]. Empty array if unknown.`,
          },
        ],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    // Extract text from response
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }

    // Parse the JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({
        candidates: [],
        error: null,
      } satisfies CandidateLookupResult);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      party?: string | null;
    }>;

    const candidates = parsed
      .filter((c) => c && typeof c.name === "string" && c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        party: c.party?.trim() || null,
      }));

    return NextResponse.json({
      candidates,
      error: null,
    } satisfies CandidateLookupResult);
  } catch (err) {
    const isAbort =
      err instanceof DOMException && err.name === "AbortError";
    const message = isAbort
      ? "Candidate lookup timed out after 30 seconds"
      : err instanceof Error
        ? err.message
        : "Failed to look up candidates";
    return NextResponse.json(
      { candidates: [], error: message } satisfies CandidateLookupResult,
      { status: 200 }
    );
  }
}
