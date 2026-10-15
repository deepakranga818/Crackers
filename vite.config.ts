import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
// Test-only modes: each serves different product data or configuration. They exist for the
// local dev server and must never end up in a deployable build.
//   private-fixture: tests/fixtures/make-fixture.mjs (confirmed test units, used by Playwright)
//   checkout-demo:   demo/make-demo-data.mjs (`npm run demo`, hand-testing the whole checkout)
const productData: Record<string, string> = {
  "private-fixture": "./tests/fixtures/products-with-units.json",
  "checkout-demo": "./demo/products-checkout-demo.json",
};
const devOnlyModes = ["demo", ...Object.keys(productData)];
export default defineConfig(({ mode, command }) => {
  if (command === "build" && devOnlyModes.includes(mode))
    throw new Error(
      `--mode ${mode} is for the local dev server only and cannot be built. Use \`npm run build:offline\`.`,
    );
  return {
    plugins: [react()],
    base: "./",
    // Catalogue and demo servers can run together without replacing each other's
    // optimized dependencies during startup.
    cacheDir: `node_modules/.vite/${mode}`,
    // Pre-bundle React's runtimes up front. Discovered late, on the first page load of an empty
    // cache, they make Vite re-optimise and reload the page mid-navigation (a cold-start flake
    // in the browser tests).
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    resolve: {
      alias: productData[mode]
        ? [
            {
              find: /^\.\/products\.json$/,
              replacement: fileURLToPath(
                new URL(productData[mode], import.meta.url),
              ),
            },
          ]
        : [],
    },
  };
});
