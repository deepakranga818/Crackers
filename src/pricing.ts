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
export const orderingAllowed = (c: Business) =>
  c.orderingEnabled &&
  c.publicCatalogueVerified &&
  requiredVerifications.every((key) => c.verification[key] === true) &&
  !!c.address?.trim() &&
  c.fulfilment.some(
    (f) =>
      f.verified &&
      (f.type === "delivery"
        ? f.servicePins.length > 0
        : !!(f.address || c.address)?.trim()),
  );
export function blockedReason(p: Product, c: Business): string | null {
  if (!orderingAllowed(c)) return "Ordering is currently disabled";
  if (
    !p.enabled ||
    p.importIssues.length ||
    !Number.isSafeInteger(p.pricePaise) ||
    p.pricePaise! <= 0
  )
    return "Product data needs correction";
  if (!p.categoryReviewed) return "Product type needs seller review";
  if (!p.sellingUnit?.trim()) return "Selling unit needs confirmation";
  if (p.availability !== "available")
    return "Availability needs seller confirmation";
  return null;
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
  const tax = c.tax?.verified
    ? Math.round((subtotal * c.tax.basisPoints) / 10000)
    : null;
  const amount = subtotal + (delivery ?? 0) + (tax ?? 0);
  if (!Number.isSafeInteger(amount))
    throw Error("Amount exceeds calculation limit");
  const allChargesKnown =
    delivery !== null && c.verification.taxTreatment === true;
  return {
    subtotal,
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
