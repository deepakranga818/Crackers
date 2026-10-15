import type { Business, Cart, Fulfilment, Product } from "./model";
export const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
export const requiredVerifications = [
  "location",
  "licences",
  "onlineOrdering",
  "permittedProducts",
  "certification",
  "serviceAreas",
  "saleDates",
  "hostApproval",
  "policies",
  "taxTreatment",
];
// A private friends list needs only a seller-arranged fulfilment method; a public shop needs
// every verification item, an address and a verified method.
export const orderingAllowed = (c: Business) =>
  c.orderingEnabled &&
  (c.privateAudience === true
    ? c.fulfilment.some((f) => f.verified)
    : c.publicCatalogueVerified &&
      requiredVerifications.every((key) => c.verification[key] === true) &&
      !!c.address?.trim() &&
      c.fulfilment.some(
        (f) =>
          f.verified &&
          (f.type === "delivery"
            ? f.servicePins.length > 0
            : !!(f.address || c.address)?.trim()),
      ));
export function blockedReason(p: Product, c: Business): string | null {
  if (!orderingAllowed(c)) return "Ordering is currently disabled";
  if (
    !p.enabled ||
    p.importIssues.length ||
    !Number.isSafeInteger(p.pricePaise) ||
    p.pricePaise! <= 0
  )
    return "Product data needs correction";
  if (p.availability === "unavailable") return "Currently unavailable";
  // Product data, not a launch formality: a private list does not waive the product type
  // review or the selling unit. A price alone never says what is being sold.
  if (!p.categoryReviewed) return "Product type needs seller review";
  if (!p.sellingUnit?.trim()) return "Selling unit needs confirmation";
  // Private list: the seller confirms stock on WhatsApp for every order. A public shop
  // needs availability recorded.
  if (c.privateAudience) return null;
  if (p.availability !== "available")
    return "Availability needs seller confirmation";
  return null;
}
// True when at least one product can actually be ordered; the UI offers ordering only then.
export const anyOrderable = (products: Product[], c: Business) =>
  products.some((p) => !blockedReason(p, c));
// Shopper wording for the offer tiers, derived from the same tiers totals() applies:
// a tier applies when the product subtotal is above the previous tier's limit and at or
// below its own, so there is no gap between "₹2,000" and "₹2,001".
export function offerSummary(offers: Business["offers"]) {
  let above = 0;
  return (offers?.tiers ?? []).map((t) => {
    const percent = t.basisPoints / 100;
    const off = `${percent}% off`;
    const text =
      t.maxSubtotalPaise === null
        ? above
          ? `${off} when it is above ${rupees(above)}`
          : off
        : above
          ? `${off} when it is above ${rupees(above)} and up to ${rupees(t.maxSubtotalPaise)}`
          : `${off} when your product total is ${rupees(t.maxSubtotalPaise)} or less`;
    above = t.maxSubtotalPaise ?? above;
    return { code: t.couponCode ?? null, percent, text };
  });
}
export function quantity(value: unknown, max: number): number | null {
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : null;
}
export function totals(
  cart: Cart,
  products: Product[],
  c: Business,
  method?: Fulfilment,
) {
  const lines = Object.entries(cart).map(([id, qty]) => ({
    product: products.find((p) => p.id === id),
    qty,
  }));
  if (
    lines.some(
      (l) =>
        !l.product ||
        quantity(
          l.qty,
          Math.min(c.maxQuantity, l.product.maxQuantityPerRequest),
        ) === null ||
        !Number.isSafeInteger(l.product.pricePaise) ||
        l.product.pricePaise! <= 0,
    )
  )
    throw Error("Invalid cart totals");
  const subtotal = lines.reduce(
    (sum, l) => sum + l.product!.pricePaise! * l.qty,
    0,
  );
  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  const delivery = method?.chargePaise ?? null;
  const tier = c.offers?.tiers.find(
    (t) => t.maxSubtotalPaise === null || subtotal <= t.maxSubtotalPaise,
  );
  const discountBasisPoints = subtotal > 0 ? (tier?.basisPoints ?? 0) : 0;
  const discount = Math.round((subtotal * discountBasisPoints) / 10000);
  const afterDiscount = subtotal - discount;
  const tax = c.tax?.verified
    ? Math.round((afterDiscount * c.tax.basisPoints) / 10000)
    : null;
  const amount = afterDiscount + (delivery ?? 0) + (tax ?? 0);
  if (!Number.isSafeInteger(amount))
    throw Error("Amount exceeds calculation limit");
  const allChargesKnown =
    delivery !== null && c.verification.taxTreatment === true;
  return {
    subtotal,
    discount,
    discountBasisPoints,
    couponCode: subtotal > 0 ? (tier?.couponCode ?? null) : null,
    afterDiscount,
    units,
    delivery,
    tax,
    amount,
    label: allChargesKnown ? "Total" : "Estimated amount",
    text:
      rupees(amount) +
      (delivery === null ? " + applicable fulfilment charge" : ""),
  };
}
