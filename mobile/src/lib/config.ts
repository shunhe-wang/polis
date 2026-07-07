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

export function parseMobileConfig(env: MobileEnv): MobileConfig {
  const apiUrl = new URL(required(env, "VITE_POLIS_API_URL"));
  const isLocal = apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1";
  if (apiUrl.protocol !== "https:" && !isLocal) {
    throw new Error("VITE_POLIS_API_URL must use HTTPS outside local development");
  }

  return {
    apiUrl: apiUrl.origin,
    supabaseUrl: required(env, "VITE_SUPABASE_URL"),
    supabaseAnonKey: required(env, "VITE_SUPABASE_ANON_KEY"),
    storeKitProductId: required(env, "VITE_STOREKIT_PRODUCT_ID"),
  };
}

let cachedConfig: MobileConfig | null = null;

export function getMobileConfig(): MobileConfig {
  cachedConfig ??= parseMobileConfig(import.meta.env);
  return cachedConfig;
}
