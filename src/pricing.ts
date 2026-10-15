import type { Business, Cart, Fulfilment, Offer, Product } from "./model";
import { bestOffer } from "./sheet/offers";
import { rupees } from "./sheet/money";
export { rupees };

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

// Why a product can't be ordered right now, or null. The sheet's Stock flag is availability
// only; a hidden or missing product is "no longer available" (it may still be in a saved cart).
export function blockedReason(
  p: Product | undefined | null,
  c: Business,
): string | null {
  if (!orderingAllowed(c)) return "Ordering is currently disabled";
  if (!p || !p.visible) return "No longer available";
  if (!Number.isSafeInteger(p.pricePaise) || p.pricePaise! <= 0)
    return "Price unavailable";
  if (!p.inStock) return "Out of stock";
  return null;
}

export function quantity(value: unknown, max: number): number | null {
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : null;
}

/**
 * Totals for the orderable lines of a cart. Lines that cannot be ordered (out of stock, hidden,
 * removed, no price) are left out of the money; the UI flags them and blocks checkout until the
 * customer removes them. Exactly one offer applies (see bestOffer).
 */
export function totals(
  cart: Cart,
  products: Product[],
  offers: Offer[],
  c: Business,
  method?: Fulfilment,
  coupon = "",
) {
  const byId = new Map(products.map((p) => [p.id, p]));
  let subtotal = 0;
  let units = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const p = byId.get(id);
    if (!p || blockedReason(p, c) || quantity(qty, c.maxQuantity) === null)
      continue;
    subtotal += p.pricePaise! * qty;
    units += qty;
  }
  const offer = bestOffer(subtotal, offers, coupon);
  const delivery = method?.chargePaise ?? null;
  const afterDiscount = subtotal - offer.discountPaise;
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
    offer,
    discount: offer.discountPaise,
    offerName: offer.offer?.name ?? null,
    couponCode: offer.offer?.mode === "coupon" ? offer.offer.code : null,
    afterDiscount,
    units,
    delivery,
    tax,
    amount,
    label: allChargesKnown ? "Total" : "Estimated amount",
    text: rupees(amount),
  };
}
