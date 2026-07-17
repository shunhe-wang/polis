import { describe, expect, it } from "vitest";
import { parseMobileConfig } from "./config";

describe("mobile config", () => {
  it("normalizes the API origin and requires public client configuration", () => {
    expect(
      parseMobileConfig({
        VITE_POLIS_API_URL: "https://polis.example/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "public-key",
        VITE_STOREKIT_PRODUCT_ID: "com.example.pass",
      })
    ).toEqual({
      apiUrl: "https://polis.example",
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "public-key",
      storeKitProductId: "com.example.pass",
    });
  });

  it("rejects a non-HTTPS production API", () => {
    expect(() =>
      parseMobileConfig({
        VITE_POLIS_API_URL: "http://polis.example",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "public-key",
        VITE_STOREKIT_PRODUCT_ID: "com.example.pass",
      })
    ).toThrow("HTTPS");
  });

  it("permits localhost for browser development", () => {
    expect(
      parseMobileConfig({
        VITE_POLIS_API_URL: "http://localhost:3001/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "public-key",
        VITE_STOREKIT_PRODUCT_ID: "com.example.pass",
      }).apiUrl
    ).toBe("http://localhost:3001");
  });
});
