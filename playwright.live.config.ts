import { defineConfig } from "@playwright/test";
// `npm run test:live`: real Chromium against the REAL Google Sheet. No route mocks, so it needs
// network access and reflects whatever the sheet contains right now. Not part of CI.
export default defineConfig({
  testDir: "tests/browser",
  testMatch: ["**/live-sheet.spec.ts"],
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:5177", headless: true },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5177 --strictPort",
    url: "http://127.0.0.1:5177",
    reuseExistingServer: true,
  },
  reporter: [["list"]],
});
