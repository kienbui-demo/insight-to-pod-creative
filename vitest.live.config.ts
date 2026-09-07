import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/live/**/*.test.ts"],
    setupFiles: ["./tests/live/setup.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
