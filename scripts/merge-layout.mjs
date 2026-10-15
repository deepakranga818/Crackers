// Merges the per-viewport files written by tests/browser/layout.spec.ts
// (reports/layout/{phase}-{w}x{h}.json) into one reports/layout-metrics.json.
// Each test writes its own file, so tests never overwrite each other's results.
// Runs as Playwright's globalTeardown; a no-op when no layout files exist.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
export default async function mergeLayout() {
  const dir = new URL("../reports/layout/", import.meta.url);
  if (!existsSync(dir)) return;
  const merged = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const entry = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    (merged[entry.phase] ??= {})[`${entry.width}x${entry.height}`] = entry;
  }
  writeFileSync(
    new URL("../reports/layout-metrics.json", import.meta.url),
    JSON.stringify(merged, null, 2) + "\n",
  );
}
