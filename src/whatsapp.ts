import type { Business, Buyer, Cart, Product } from "./model";
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
export function makeRequest(
  cart: Cart,
  products: Product[],
  buyer: Buyer,
  c: Business,
  previous?: RequestDraft,
): RequestDraft {
  if (
    !orderingAllowed(c) ||
    !Object.keys(cart).length ||
    Object.keys(validateBuyer(buyer, c)).length ||
    Object.keys(cart).some(
      (id) =>
        !products.find((p) => p.id === id) ||
        blockedReason(
          products.find((p) => p.id === id)!,
          c,
        ),
    )
  )
    throw Error("Request is not ready. Review product and buyer details.");
  const method = c.fulfilment.find((f) => f.id === buyer.method && f.verified)!;
  const calculated = totals(cart, products, c, method);
  const clean = Object.fromEntries(
    Object.entries(buyer).map(([k, v]) => [
      k,
      typeof v === "string" ? safeField(v) : v,
    ]),
  );
  const fingerprint = JSON.stringify([
    Object.entries(cart).sort(),
    clean,
    c.catalogueVersion,
    c.whatsapp,
    c.urlThreshold,
    calculated,
    products
      .filter((p) => p.id in cart)
      .map((p) => [p.id, p.pricePaise, p.sellingUnit]),
    method,
    c.tax,
  ]);
  if (previous?.fingerprint === fingerprint) return previous;
  const reference = "REQ-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const created =
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "long",
      timeZone: "Asia/Kolkata",
    }).format(new Date()) + " (Asia/Kolkata)";
  // WhatsApp bold is a single asterisk, so *text* renders like the owner's template.
  const lines = [
    "🎆 *DIWALI CRACKERS ORDER* 🪔",
    "",
    "Hello! 👋",
    "",
    "I would like to order the following crackers:",
    "",
    "*🛍️ Order Details*",
    "",
  ];
  Object.entries(cart).forEach(([id, qty], i) => {
    const p = products.find((p) => p.id === id)!;
    const unit = p.sellingUnit?.startsWith("Demo unit")
      ? ""
      : ` (Unit: ${p.sellingUnit ? safeField(p.sellingUnit) : "to be confirmed"})`;
    lines.push(
      `${i + 1}. *${safeField(p.name)} (${safeField(p.originalCategory)})* — Qty: ${qty} × ${rupees(p.pricePaise!)} = ${rupees(p.pricePaise! * qty)}${unit}`,
    );
  });
  lines.push("");
  lines.push(`Product subtotal: ${rupees(calculated.subtotal)}`);
  if (calculated.discount > 0)
    lines.push(
      `Offer (${calculated.discountBasisPoints / 100}% off): −${rupees(calculated.discount)}`,
    );
  if (calculated.couponCode) lines.push(`Coupon: ${calculated.couponCode}`);
  if (calculated.delivery === null)
    lines.push("Fulfilment charge: to be confirmed on WhatsApp");
  else if (calculated.delivery > 0)
    lines.push(`Fulfilment charge: ${rupees(calculated.delivery)}`);
  if (calculated.tax !== null)
    lines.push(`${c.tax!.label}: ${rupees(calculated.tax)}`);
  lines.push("");
  lines.push(`💰 *${calculated.label}: ${calculated.text}*`, "");
  lines.push(
    `👤 *Buyer:* ${clean.name}`,
    `📞 *Mobile:* ${normalizeMobile(buyer.mobile)}`,
  );
  // Undecided arrangements (or the local demo fixture) must not claim a method or place.
  const pickupAddress = !method.id.startsWith("demo-") && method.address;
  lines.push(
    `🚚 *Fulfilment:* ${
      method.type === "delivery"
        ? "Delivery"
        : pickupAddress
          ? `Pickup — ${safeField(pickupAddress)}`
          : "to be confirmed on WhatsApp"
    }`,
  );
  if (method.type === "delivery")
    lines.push(
      `📍 *Address:* ${[buyer.address, buyer.locality, buyer.city, buyer.state, buyer.pin].map(safeField).join(", ")}`,
    );
  if (clean.landmark) lines.push(`📌 *Landmark:* ${clean.landmark}`);
  if (clean.notes) lines.push(`📝 *Notes:* ${clean.notes}`);
  lines.push("", "Wishing you and your family a very Happy Diwali! 🪔✨🎇");
  const message = lines.join("\n");
  const full = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(message)}`;
  const long = full.length > c.urlThreshold;
  const url = long
    ? `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(`Order request ${reference}. I will paste the complete request or attach its text file. Please confirm availability, fulfilment and final amount.`)}`
    : full;
  if (c.whatsapp !== "919992230740")
    throw Error("Unexpected WhatsApp recipient");
  return { fingerprint, reference, created, message, url, long };
}
