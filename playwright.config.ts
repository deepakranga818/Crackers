import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175", headless: true },
  webServer: [
    {
      command: "npm run dev -- --port 5175",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev:demo -- --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: true,
    },
  ],
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/browser-results.json" }],
  ],
});
