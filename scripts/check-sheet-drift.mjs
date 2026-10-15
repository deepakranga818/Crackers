// After `npm run sync`, fails if the live Google Sheet's content differs from the committed
// snapshot. `fetchedAt` changes on every sync, so it is ignored: the comparison uses the
// content hash (`version`, over products and offers) and the CSV hash (`source.sha256`).
//
// Usage: node scripts/check-sheet-drift.mjs [committed.json] [current.json]
// Default: the committed src/products.json (git HEAD) against the working copy. Commit your own
// changes first, or HEAD will differ for reasons unrelated to the Sheet.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const [, , committedPath, currentPath = "src/products.json"] = process.argv;
const committed = JSON.parse(
  committedPath
    ? readFileSync(committedPath, "utf8")
    : execFileSync("git", ["show", "HEAD:src/products.json"], { encoding: "utf8" }),
);
const current = JSON.parse(readFileSync(currentPath, "utf8"));
const changes = [];
if (committed.version !== current.version)
  changes.push(`product/offer content hash ${committed.version} -> ${current.version}`);
if (committed.source.sha256 !== current.source.sha256)
  changes.push("the exported Sheet CSV changed");
if (committed.products.length !== current.products.length)
  changes.push(`row count ${committed.products.length} -> ${current.products.length}`);
if (changes.length) {
  console.error("The live Google Sheet differs from the committed snapshot:");
  for (const change of changes) console.error(`- ${change}`);
  console.error("Review the diff, run the tests, then commit the refreshed snapshot.");
  process.exit(1);
}
console.log(
  `Snapshot matches the live Sheet (version ${current.version}, ${current.products.length} products).`,
);
