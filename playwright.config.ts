import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const chromiumPath = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium";
const chromiumLaunch = existsSync(chromiumPath)
  ? { executablePath: chromiumPath, args: ["--no-sandbox"] }
  : {};
const selectedProjects = process.argv.filter(
  (arg, index, args) =>
    args[index - 1] === "--project" || arg.startsWith("--project="),
);
const needsPreview =
  selectedProjects.length === 0 ||
  selectedProjects.some((project) => project.includes("offline"));
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunch },
      testIgnore: /offline\.spec\.ts/,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: /offline\.spec\.ts/,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: /offline\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: chromiumLaunch },
      testIgnore: /offline\.spec\.ts/,
    },
    {
      name: "offline",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromiumLaunch,
        baseURL: "http://127.0.0.1:4173",
      },
      testMatch: /offline\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "WILLOW_E2E=1 pnpm dev --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    ...(needsPreview
      ? [
          {
            command: "pnpm exec vite preview --port 4173",
            url: "http://127.0.0.1:4173",
            reuseExistingServer: !process.env.CI,
            timeout: 120000,
          },
        ]
      : []),
  ],
});
