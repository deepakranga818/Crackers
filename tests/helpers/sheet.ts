// Builds sheet CSV in the same shape as the real "Diwali Store" tab, for controlled fixtures.
// Production code never imports this.
export type P = Partial<{
  id: string;
  name: string;
  category: string;
  price: string;
  mrp: string;
  pieces: string;
  stock: string;
  show: string;
  desc: string;
  images: string;
  notes: string;
  shots: string;
}>;
export type O = Partial<{
  name: string;
  mode: string;
  code: string;
  type: string;
  value: string;
  min: string;
  max: string;
  enabled: string;
  notes: string;
}>;

export const PRODUCT_HEADERS: Record<keyof P, string> = {
  id: "Product ID",
  name: "Product name",
  category: "Category",
  price: "Selling price (₹)",
  mrp: "MRP (₹)",
  pieces: "Pieces per pack",
  stock: "Stock",
  show: "Show on website",
  desc: "Short description",
  images: "Image links",
  notes: "Notes",
  shots: "Shots",
};
export const OFFER_HEADERS: Record<keyof O, string> = {
  name: "Offer name",
  mode: "Mode",
  code: "Coupon code",
  type: "Discount type",
  value: "Discount value",
  min: "Minimum order (₹)",
  max: "Maximum order (₹)",
  enabled: "Enabled",
  notes: "Notes",
};

export const quote = (c: string) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(quote).join(",")).join("\n") + "\n";

export const product = (n: number, over: P = {}): P => ({
  id: `PRD-${String(n).padStart(4, "0")}`,
  name: `Product ${n}`,
  category: "Sky shot",
  price: "₹100.00",
  mrp: "₹140.00",
  stock: "TRUE",
  show: "YES",
  notes: "internal note",
  ...over,
});

export type SheetOptions = {
  products?: P[];
  offers?: O[];
  settings?: [string, string][];
  productColumns?: (keyof P)[]; // order of product columns
  blankBetweenProducts?: boolean;
  blankBetweenOffers?: boolean;
  noOffersMarker?: boolean;
  extraRows?: { afterProducts?: string[][]; afterOffers?: string[][] };
};
export function sheet(o: SheetOptions = {}): string {
  const products = o.products ?? [product(1), product(2)];
  const offers = o.offers ?? [];
  const settings = o.settings ?? [
    ["Shop name", "Test Shop"],
    ["WhatsApp number", "919876543210"],
  ];
  const cols = o.productColumns ?? (Object.keys(PRODUCT_HEADERS) as (keyof P)[]);
  const offerCols = Object.keys(OFFER_HEADERS) as (keyof O)[];
  const rows: string[][] = [
    ["DIWALI STORE"],
    ["Update products below. To add a product, insert a table row above the COUPONS & OFFERS section."],
    [],
    cols.map((c) => PRODUCT_HEADERS[c]),
  ];
  products.forEach((p, i) => {
    rows.push(cols.map((c) => p[c] ?? ""));
    if (o.blankBetweenProducts && i % 2 === 0) rows.push([]);
  });
  rows.push(...(o.extraRows?.afterProducts ?? []));
  rows.push([], []);
  if (!o.noOffersMarker) rows.push(["COUPONS & OFFERS"]);
  rows.push(["Discount value: Percent 10 means 10% off. Fixed 100 means ₹100 off."], []);
  rows.push(offerCols.map((c) => OFFER_HEADERS[c]));
  offers.forEach((x, i) => {
    rows.push(offerCols.map((c) => x[c] ?? ""));
    if (o.blankBetweenOffers && i % 2 === 0) rows.push([]);
  });
  rows.push(...(o.extraRows?.afterOffers ?? []));
  rows.push([], ["Minimum order = smallest qualifying subtotal. Both include the entered amount."]);
  rows.push(["SHOP SETTINGS"], [], ["Setting", "Value", "Meaning"]);
  for (const [k, v] of settings) rows.push([k, v, "meaning"]);
  rows.push([], ["Stock is availability only; no quantity tracking."]);
  return toCsv(rows);
}
