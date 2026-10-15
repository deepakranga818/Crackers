import type { Offer } from "../model";
import { rupees } from "./money";

export type CouponStatus =
  | "none" // nothing entered
  | "applied"
  | "unknown" // no coupon with this code
  | "disabled" // the code exists but is switched off
  | "not-eligible" // the order is outside the coupon's minimum/maximum
  | "beaten-by-automatic"; // a valid coupon, but an automatic offer saves more

export type OfferResult = {
  offer: Offer | null;
  discountPaise: number;
  status: CouponStatus;
  message: string | null; // customer-facing explanation, when one is useful
};

// Percent offers use basis points (10% = 1000) and round half up to whole paise. Fixed offers are
// exact paise. Either way the discount never exceeds the merchandise subtotal.
export function discountFor(offer: Offer, subtotal: number): number {
  if (subtotal <= 0) return 0;
  const raw =
    offer.type === "percent"
      ? Math.floor((subtotal * offer.value + 5000) / 10000)
      : offer.value;
  return Math.min(raw, subtotal);
}

// Order limits are inclusive and apply to the merchandise subtotal before any discount.
export const eligible = (offer: Offer, subtotal: number) =>
  offer.enabled &&
  (offer.minPaise === null || subtotal >= offer.minPaise) &&
  (offer.maxPaise === null || subtotal <= offer.maxPaise);

/**
 * One best offer, never stacked. Candidates are the enabled Automatic offers whose order limits
 * include the subtotal, plus the enabled Coupon matching the entered code (trimmed, any case).
 * The largest saving wins. Tie-break, in order: the coupon the customer entered, then an
 * Automatic offer, then the earlier sheet row.
 */
export function bestOffer(subtotal: number, offers: Offer[], couponInput: string): OfferResult {
  const typed = couponInput.trim();
  const key = typed.toUpperCase();
  let status: CouponStatus = typed ? "unknown" : "none";
  let message: string | null = typed ? `Code ${typed} is not valid.` : null;
  const candidates: { offer: Offer; saving: number; isCoupon: boolean }[] = [];

  for (const o of offers)
    if (o.mode === "automatic" && eligible(o, subtotal)) {
      const saving = discountFor(o, subtotal);
      if (saving > 0) candidates.push({ offer: o, saving, isCoupon: false });
    }

  let couponCandidate: (typeof candidates)[number] | null = null;
  if (typed) {
    const matches = offers.filter((o) => o.mode === "coupon" && o.code!.toUpperCase() === key);
    const active = matches.find((o) => o.enabled);
    if (active) {
      if (eligible(active, subtotal)) {
        const saving = discountFor(active, subtotal);
        if (saving > 0) {
          couponCandidate = { offer: active, saving, isCoupon: true };
          candidates.push(couponCandidate);
          status = "applied";
          message = null;
        } else {
          status = "not-eligible";
          message = `${active.code} gives no saving on this order.`;
        }
      } else {
        status = "not-eligible";
        message =
          active.minPaise !== null && subtotal < active.minPaise
            ? `${active.code} needs an order of at least ${rupees(active.minPaise)}.`
            : `${active.code} is for orders up to ${rupees(active.maxPaise!)}.`;
      }
    } else if (matches.length) {
      status = "disabled";
      message = `Code ${typed} is not active right now.`;
    }
  }

  const rank = (c: (typeof candidates)[number]) => [-c.saving, c.isCoupon ? 0 : 1, c.offer.row] as const;
  candidates.sort((a, b) => {
    const x = rank(a), y = rank(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  const best = candidates[0];
  if (!best) return { offer: null, discountPaise: 0, status, message };
  if (couponCandidate && best !== couponCandidate) {
    status = "beaten-by-automatic";
    message = `${best.offer.name} gives a bigger saving than ${couponCandidate.offer.code}, so it was applied instead.`;
  }
  return { offer: best.offer, discountPaise: best.saving, status, message };
}

/** Plain-words description of an offer for the offers strip. */
export function describeOffer(o: Offer): string {
  const amount = o.type === "percent" ? `${o.value / 100}% off` : `${rupees(o.value)} off`;
  const range =
    o.minPaise !== null && o.maxPaise !== null
      ? ` on orders from ${rupees(o.minPaise)} to ${rupees(o.maxPaise)}`
      : o.minPaise !== null
        ? ` on orders of ${rupees(o.minPaise)} or more`
        : o.maxPaise !== null
          ? ` on orders up to ${rupees(o.maxPaise)}`
          : "";
  return `${amount}${range}`;
}
