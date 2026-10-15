import { defineConfig, type ReporterDescription } from "@playwright/test";
// Browser tests never contact Google: each test serves a fixture CSV in place of the sheet
// (tests/browser/sheet-fixture.ts). The real sheet is checked separately by `npm run test:live`.
const server = (port: number, mode?: string) => ({
  command: `npx vite --host 127.0.0.1 --port ${port} --strictPort${mode ? ` --mode ${mode}` : ""}`,
  url: `http://127.0.0.1:${port}`,
  reuseExistingServer: true,
});
const reporter: ReporterDescription[] = [
  ["list"],
  ["json", { outputFile: "reports/browser-results.json" }],
];
// In CI, failures also become annotations on the workflow run.
if (process.env.CI) reporter.push(["github"]);
export default defineConfig({
  testDir: "tests/browser",
  testIgnore: ["**/live-sheet.spec.ts", "**/base-path.spec.ts"],
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175", headless: true },
  webServer: [
    // 5175: the normal app.
    server(5175),
    // 5180: the local checkout demo (`npm run demo`): sample fulfilment methods, dry-run handoff.
    server(5180, "checkout-demo"),
  ],
  globalTeardown: "./scripts/merge-layout.mjs",
  reporter,
});
