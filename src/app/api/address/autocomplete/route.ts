import { NextRequest, NextResponse } from "next/server";

interface GeoapifyAutocompleteResult {
  formatted?: string;
  address_line1?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  county?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
}

interface AddressSuggestion {
  label: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

function normalizeStateCode(value: string | undefined): string {
  if (!value) return "";
  const cleaned = value.replace(/^US-/, "").trim();
  return cleaned.length <= 3 ? cleaned.toUpperCase() : cleaned;
}

function buildStreetAddress(result: GeoapifyAutocompleteResult): string {
  return result.address_line1?.trim() ?? "";
}

function buildCity(result: GeoapifyAutocompleteResult): string {
  return (
    result.city?.trim() ??
    result.town?.trim() ??
    result.village?.trim() ??
    result.suburb?.trim() ??
    result.county?.trim() ??
    ""
  );
}

function mapSuggestion(result: GeoapifyAutocompleteResult): AddressSuggestion | null {
  const streetAddress = buildStreetAddress(result);
  const city = buildCity(result);
  const state = normalizeStateCode(result.state_code ?? result.state);
  const zipCode = result.postcode?.trim() ?? "";
  const label = result.formatted?.trim() ?? [streetAddress, city, state, zipCode].filter(Boolean).join(", ");

  if (!label) {
    return null;
  }

  return {
    label,
    streetAddress,
    city,
    state,
    zipCode,
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ enabled: false, suggestions: [] });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) {
    return NextResponse.json({ enabled: true, suggestions: [] });
  }

  if (query.length > 200) {
    return NextResponse.json(
      { enabled: true, suggestions: [], error: "Address query is too long." },
      { status: 400 }
    );
  }

  const countryCode =
    request.nextUrl.searchParams.get("countryCode")?.trim().toLowerCase() ||
    process.env.ADDRESS_AUTOCOMPLETE_COUNTRY_CODE?.trim().toLowerCase() ||
    "us";

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", apiKey);
  if (countryCode) {
    url.searchParams.set("filter", `countrycode:${countryCode}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          enabled: true,
          suggestions: [],
          error: "Address autocomplete is temporarily unavailable.",
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      results?: GeoapifyAutocompleteResult[];
    };

    const seen = new Set<string>();
    const suggestions = (data.results ?? [])
      .map(mapSuggestion)
      .filter((value): value is AddressSuggestion => Boolean(value))
      .filter((suggestion) => {
        const key = suggestion.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return NextResponse.json({ enabled: true, suggestions });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Address autocomplete timed out."
        : "Address autocomplete is temporarily unavailable.";

    return NextResponse.json(
      { enabled: true, suggestions: [], error: message },
      {
        status:
          error instanceof Error && error.name === "AbortError" ? 504 : 502,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}
