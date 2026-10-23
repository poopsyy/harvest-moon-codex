import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    maxWorkers: 2,
    testTimeout: 30000,
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts", "src/systems/**/*.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: { lines: 85 },
    },
  },
});
