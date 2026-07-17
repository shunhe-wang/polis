import { createClient } from "@supabase/supabase-js";
import type { MobileConfig } from "./config";
import { secureAuthStorage } from "./secure-storage";

let client: ReturnType<typeof createClient> | null = null;

export function getSupabase(config: MobileConfig) {
  client ??= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: secureAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return client;
}
