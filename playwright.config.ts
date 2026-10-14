import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:5173", headless: true },
  webServer: [
    {
      command: "npm run dev -- --port 5173",
      url: "http://127.0.0.1:5173",
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
