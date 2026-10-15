import { defineConfig } from "@playwright/test";
// UI tests run against the committed src/products.json snapshot: no Sheet sync and no network.
// Live Sheet verification is separate (`npm run test:live`).
const server = (port: number, mode?: string, prepare = "") => ({
  command: `${prepare}npx vite --host 127.0.0.1 --port ${port} --strictPort${mode ? ` --mode ${mode}` : ""}`,
  url: `http://127.0.0.1:${port}`,
  reuseExistingServer: true,
});
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175", headless: true },
  webServer: [
    // 5175: production configuration (the real private-list data).
    server(5175),
    // 5174: local demo fixtures (public-style verification, demo units).
    server(5174, "demo"),
    // 5176: production-style private list with test-only confirmed units.
    server(5176, "private-fixture", "node tests/fixtures/make-fixture.mjs && "),
    // 5180: the local checkout demo (`npm run demo`): sample units, fulfilment, dry-run handoff.
    server(5180, "checkout-demo", "node demo/make-demo-data.mjs && "),
  ],
  globalTeardown: "./scripts/merge-layout.mjs",
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/browser-results.json" }],
  ],
});
