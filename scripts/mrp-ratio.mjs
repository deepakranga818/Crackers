// Prints how the Sheet's MRP column relates to the selling price, so the owner can be asked
// a precise question before struck-through prices and "% off" are shown on cards.
// Usage: node scripts/mrp-ratio.mjs
import { readFileSync } from "node:fs";
const { products } = JSON.parse(
  readFileSync(new URL("../src/products.json", import.meta.url), "utf8"),
);
const rows = products.filter((p) => p.pricePaise && p.mrpPaise);
const ratios = rows.map((p) => p.mrpPaise / p.pricePaise);
const distinct = [...new Set(ratios.map((r) => r.toFixed(4)))];
console.log(`${rows.length} of ${products.length} products have a price and an MRP.`);
console.log(`Distinct MRP / selling-price ratios: ${distinct.join(", ")}`);
console.log(
  distinct.length === 1
    ? `Every MRP is exactly ${distinct[0]}x the selling price, which looks formula-derived rather than a genuine reference price. Reference prices stay hidden until the owner confirms them (source/publication-approval.json).`
    : "MRP values vary independently of price.",
);
