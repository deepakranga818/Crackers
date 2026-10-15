import type { Business, Buyer, Cart, Snapshot } from "./model";
import { normalizeMobile, safeField, validateBuyer } from "./buyer";
import { blockedReason, orderingAllowed, rupees, totals } from "./pricing";

export type RequestDraft = {
  fingerprint: string;
  reference: string;
  created: string;
  message: string;
  url: string;
  long: boolean;
};

export const RECIPIENT_ERROR =
  "The seller’s WhatsApp number is missing or invalid, so your order can’t be prepared right now. Your cart is saved. Please try again shortly or contact the seller directly.";

/**
 * Builds the WhatsApp request from one snapshot: the exact data the customer reviewed. Nothing is
 * sent; the returned link only prepares a message. The recipient comes from the sheet's SHOP
 * SETTINGS; there is no fallback number.
 */
export function makeRequest(
  cart: Cart,
  snapshot: Snapshot,
  buyer: Buyer,
  c: Business,
  coupon: string,
  previous?: RequestDraft,
): RequestDraft {
  const recipient = snapshot.settings.whatsapp;
  if (!recipient || !/^[1-9]\d{10,14}$/.test(recipient))
    throw Error(RECIPIENT_ERROR);
  const byId = new Map(snapshot.products.map((p) => [p.id, p]));
  if (
    !orderingAllowed(c) ||
    !Object.keys(cart).length ||
    Object.keys(validateBuyer(buyer, c)).length ||
    Object.keys(cart).some((id) => blockedReason(byId.get(id), c))
  )
    throw Error("Request is not ready. Review product and buyer details.");
  const method = c.fulfilment.find((f) => f.id === buyer.method && f.verified)!;
  const calculated = totals(cart, snapshot.products, snapshot.offers, c, method, coupon);
  const clean = Object.fromEntries(
    Object.entries(buyer).map(([k, v]) => [
      k,
      typeof v === "string" ? safeField(v) : v,
    ]),
  );
  const fingerprint = JSON.stringify([
    Object.entries(cart).sort(),
    clean,
    snapshot.version,
    recipient,
    c.urlThreshold,
    calculated,
    method,
    c.tax,
  ]);
  if (previous?.fingerprint === fingerprint) return previous;
  // getRandomValues, unlike randomUUID, also exists on plain-HTTP pages (e.g. a LAN test URL).
  const reference =
    "REQ-" +
    Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
      b.toString(16).padStart(2, "0"),
    )
      .join("")
      .toUpperCase();
  const created =
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "long",
      timeZone: "Asia/Kolkata",
    }).format(new Date()) + " (Asia/Kolkata)";
  // WhatsApp bold is a single asterisk. No emoji: they showed up as replacement characters on the seller's WhatsApp.
  const lines = ["*DIWALI CRACKERS ORDER*"];
  if (snapshot.settings.shopName)
    lines.push(`Shop: ${safeField(snapshot.settings.shopName)}`);
  lines.push("");
  Object.entries(cart).forEach(([id, qty], i) => {
    const p = byId.get(id)!;
    lines.push(
      `${i + 1}. *${safeField(p.name)}* (ID: ${safeField(p.id)}) — Qty: ${qty} × ${rupees(p.pricePaise!)} = ${rupees(p.pricePaise! * qty)}`,
    );
    const pack = [
      p.piecesPerPack ? `${p.piecesPerPack} pieces per pack` : "",
      p.shots ? `${p.shots} shots` : "",
    ].filter(Boolean);
    if (pack.length) lines.push(`   ${pack.join(" · ")}`);
  });
  lines.push("", `Subtotal: ${rupees(calculated.subtotal)}`);
  if (calculated.offerName && calculated.discount > 0) {
    lines.push(`Offer: ${safeField(calculated.offerName)}`);
    if (calculated.couponCode) lines.push(`Coupon: ${safeField(calculated.couponCode)}`);
    lines.push(`Discount: −${rupees(calculated.discount)}`);
  }
  if (calculated.delivery)
    lines.push(`Fulfilment charge: ${rupees(calculated.delivery)}`);
  if (calculated.tax !== null)
    lines.push(`${c.tax!.label}: ${rupees(calculated.tax)}`);
  // Only a fully known amount is called Total; otherwise the label says what is left out.
  const amountLabel =
    calculated.label === "Total"
      ? "Total"
      : calculated.delivery === null
        ? "Merchandise total (before any delivery charge)"
        : "Estimated amount";
  lines.push(
    "",
    `*${amountLabel}: ${rupees(calculated.amount)}*`,
    "",
    `*Buyer:* ${clean.name}`,
    `*Mobile:* ${normalizeMobile(buyer.mobile)}`,
  );
  // Fulfilment appears only when it is a real choice.
  if (method.type === "delivery")
    lines.push(
      "*Fulfilment:* Delivery",
      `*Address:* ${[buyer.address, buyer.locality, buyer.city, buyer.state, buyer.pin].map(safeField).join(", ")}`,
    );
  else if (method.address)
    lines.push(`*Fulfilment:* Pickup — ${safeField(method.address)}`);
  if (clean.landmark) lines.push(`*Landmark:* ${clean.landmark}`);
  if (clean.notes) lines.push(`*Notes:* ${clean.notes}`);
  lines.push("", "Wishing you and your family a very Happy Diwali!");
  const message = lines.join("\n");
  const full = `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
  const long = full.length > c.urlThreshold;
  const url = long
    ? `https://wa.me/${recipient}?text=${encodeURIComponent(`Order request ${reference}. I will paste the complete request or attach its text file. Please confirm availability, fulfilment and final amount.`)}`
    : full;
  return { fingerprint, reference, created, message, url, long };
}
