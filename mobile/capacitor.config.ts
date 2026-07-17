import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: process.env.IOS_BUNDLE_ID ?? "com.ateliersw.polis",
  appName: "Polis",
  webDir: "dist",
  server: {
    iosScheme: "capacitor",
  },
};

export default config;
