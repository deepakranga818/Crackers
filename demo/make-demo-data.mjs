// Builds demo/products-checkout-demo.json for the local checkout demo (`npm run demo`).
//
// Development-only sample data, kept apart from the real catalogue:
//   - reads the committed src/products.json; never reads or writes source/product-overrides.json
//   - every unit and availability below is invented and says so ("(sample)")
//   - only served by `vite --mode checkout-demo` (vite.config.ts); production builds cannot use it
// Negative cases stay in on purpose: unknown units, an unavailable product, and the five products
// whose type is still awaiting seller review keep their imported (blocked) state.
import { readFileSync, writeFileSync } from "node:fs";

const source = JSON.parse(
  readFileSync(new URL("../src/products.json", import.meta.url), "utf8"),
);
const units = [
  "pack of 10 (sample)",
  "box of 5 (sample)",
  "single piece (sample)",
  "pack of 25 (sample)",
];
const noUnit = new Set(["dc-003", "dc-008"]); // negative: unit not confirmed
const unavailable = new Set(["dc-009"]); // negative: currently unavailable

const real = source.products.map((p, i) => ({
  ...p,
  sellingUnit: noUnit.has(p.id) ? null : units[i % units.length],
  availability: unavailable.has(p.id) ? "unavailable" : "available",
}));

const sample = (n, fields) => ({
  sourceRowNumber: 1000 + n,
  sourceNumber: 1000 + n,
  originalCategory: "Sample product (demo data)",
  sourceImageLinks: [],
  availability: "available",
  stockQuantity: null,
  maxQuantityPerRequest: 99,
  verifiedSpecifications: [],
  certificationDetails: null,
  enabled: true,
  categoryReviewed: true,
  displayOrder: 1000 + n,
  importIssues: [],
  mrpPaise: null,
  packDetails: "Sample pack information (demo data, not real).",
  ...fields,
});
const extras = [
  // A long name and variant, three photos, and a price with paise.
  sample(1, {
    id: "demo-long-name",
    name: "Sample · Super Deluxe Multicolour Festival Fountain Gift Box with Crackling Finale (assorted family pack of twelve, long name for wrapping tests)",
    variantLabel:
      "Sample long variant label · assorted colours · extra large family pack",
    categoryId: "pots",
    categoryLabel: "Flower Pots / Anar",
    pricePaise: 2450,
    sellingUnit: "gift box of 12 (sample)",
    images: [
      "images/dc-004-1.webp",
      "images/dc-004-2.webp",
      "images/dc-005-1.webp",
    ],
  }),
  // A photo link that fails to load: the card falls back to "Product image coming soon".
  sample(2, {
    id: "demo-broken-photo",
    name: "Sample · Photo that fails to load",
    variantLabel: "Image fallback test",
    categoryId: "sparklers",
    categoryLabel: "Sparklers / Phuljadi",
    pricePaise: 7550,
    sellingUnit: "pack of 10 (sample)",
    images: ["images/sample-photo-that-does-not-exist.webp"],
  }),
  // A low per-request limit and a high price: tests the quantity cap and the offer tiers.
  sample(3, {
    id: "demo-limit-5",
    name: "Sample · Limited to 5 per request",
    variantLabel: "Quantity limit test",
    categoryId: "shots",
    categoryLabel: "Sky Shots",
    pricePaise: 120000,
    maxQuantityPerRequest: 5,
    sellingUnit: "box of 1 (sample)",
    images: [],
  }),
];

writeFileSync(
  new URL("./products-checkout-demo.json", import.meta.url),
  JSON.stringify({
    ...source,
    version: `checkout-demo-${source.version}`,
    products: [...real, ...extras],
  }),
);
console.log(
  `Wrote demo/products-checkout-demo.json: ${real.length} catalogue products + ${extras.length} sample products.`,
);
