import { describe, expect, it } from "vitest";
import { getSameOriginError } from "@/lib/csrf";

function makeRequest(input: {
  url: string;
  origin?: string;
  host?: string;
  proto?: string;
}) {
  const headers = new Headers();
  if (input.origin) headers.set("origin", input.origin);
  if (input.host) headers.set("x-forwarded-host", input.host);
  if (input.proto) headers.set("x-forwarded-proto", input.proto);
  return { headers, url: input.url };
}

describe("csrf origin checks", () => {
  it("allows same-origin requests", () => {
    expect(
      getSameOriginError(
        makeRequest({
          url: "https://polis.example.com/api/research",
          origin: "https://polis.example.com",
        })
      )
    ).toBeNull();
  });

  it("blocks mismatched origins", () => {
    expect(
      getSameOriginError(
        makeRequest({
          url: "https://polis.example.com/api/research",
          origin: "https://evil.example.com",
        })
      )
    ).toBe("Cross-site request blocked");
  });
});
