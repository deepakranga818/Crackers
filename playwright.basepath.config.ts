import { defineConfig } from "@playwright/test";
// `npm run test:basepath`: builds the site normally, then serves dist/ under /Crackers/ the way a
// GitHub Pages project site would. Local only; nothing is deployed.
export default defineConfig({
  testDir: "tests/browser",
  testMatch: ["**/base-path.spec.ts"],
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4181", headless: true },
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4181 --strictPort --base /Crackers/",
    url: "http://127.0.0.1:4181/Crackers/",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  reporter: [["list"]],
});
