import { defineConfig } from "vitest/config";
import path from "node:path";

// Config for the live AI-quality evals in evals/. These call the real Z.AI
// provider and are excluded from the normal unit-test run.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
