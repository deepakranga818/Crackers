import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "./",
  // Catalogue and demo servers can run together without replacing each other's
  // optimized dependencies during startup.
  cacheDir: `node_modules/.vite/${mode}`,
}));
