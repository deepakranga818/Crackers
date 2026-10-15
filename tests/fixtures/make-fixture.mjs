// Builds tests/fixtures/products-with-units.json from the committed src/products.json.
// Test-only: it gives every product a clearly fake confirmed unit so the private-list
// checkout can be exercised, while category-review and availability data stay as imported
// (the five "More products" items remain blocked). Never used by a production build.
import { readFileSync, writeFileSync } from "node:fs";
const source = JSON.parse(
  readFileSync(new URL("../../src/products.json", import.meta.url), "utf8"),
);
const fixture = {
  ...source,
  version: `fixture-${source.version}`,
  products: source.products.map((p) => ({
    ...p,
    sellingUnit: "Box (test fixture, not seller confirmed)",
  })),
};
writeFileSync(
  new URL("./products-with-units.json", import.meta.url),
  JSON.stringify(fixture),
);
