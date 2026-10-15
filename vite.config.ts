import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// `checkout-demo` is a dev-server-only mode (a dry-run checkout with sample fulfilment methods).
// It reads the same live sheet as everything else and must never end up in a deployable build.
const devOnlyModes = ["checkout-demo"];
export default defineConfig(({ mode, command }) => {
  if (command === "build" && devOnlyModes.includes(mode))
    throw new Error(
      `--mode ${mode} is for the local dev server only and cannot be built. Use \`npm run build\`.`,
    );
  return {
    plugins: [react()],
    // Relative base: the same build works at a domain root and under a GitHub Pages
    // project path such as /<repository>/.
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
        "lottie-web/build/player/lottie_light",
      ],
    },
  };
});
