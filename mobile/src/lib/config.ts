export interface MobileConfig {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  storeKitProductId: string;
}

type MobileEnv = Record<string, string | undefined>;

function required(env: MobileEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function requiredHttpsUrl(env: MobileEnv, key: string): URL {
  let url: URL;
  try {
    url = new URL(required(env, key));
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("is required")) {
      throw error;
    }
    throw new Error(`${key} must be a valid URL`);
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error(`${key} must use HTTPS outside local development`);
  }
  return url;
}

export function parseMobileConfig(env: MobileEnv): MobileConfig {
  // iOS App Transport Security blocks cleartext requests at runtime with an
  // opaque failure; validating both endpoints at startup surfaces a clear
  // configuration error instead.
  const apiUrl = requiredHttpsUrl(env, "VITE_POLIS_API_URL");
  const supabaseUrl = requiredHttpsUrl(env, "VITE_SUPABASE_URL");

  return {
    apiUrl: apiUrl.origin,
    supabaseUrl: supabaseUrl.origin,
    supabaseAnonKey: required(env, "VITE_SUPABASE_ANON_KEY"),
    storeKitProductId: required(env, "VITE_STOREKIT_PRODUCT_ID"),
  };
}

let cachedConfig: MobileConfig | null = null;

export function getMobileConfig(): MobileConfig {
  cachedConfig ??= parseMobileConfig(import.meta.env);
  return cachedConfig;
}
