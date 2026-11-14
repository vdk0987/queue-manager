import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Load the test environment before any application module is imported.
loadEnv({ path: ".env.test", override: true });

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    restoreMocks: true,
  },
});
