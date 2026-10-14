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
  const lines = [
    "DIWALI CRACKERS — ORDER REQUEST",
    `Request reference: ${reference}`,
    `Catalogue version: ${c.catalogueVersion}`,
    `Created: ${created}`,
    "",
    "BUYER",
    `Name: ${clean.name}`,
    `Mobile: ${normalizeMobile(buyer.mobile)}`,
    "",
    "FULFILMENT",
    `Method: ${safeField(method.label)}`,
  ];
  if (method.type === "delivery")
    lines.push(
      `Address: ${[buyer.address, buyer.locality, buyer.city, buyer.state, buyer.pin].map(safeField).join(", ")}`,
    );
  else
    lines.push(
      `Pickup location: ${safeField(method.address || c.address || "")}`,
    );
  if (clean.landmark) lines.push(`Landmark: ${clean.landmark}`);
  lines.push("", "ITEMS");
  Object.entries(cart).forEach(([id, qty], i) => {
    const p = products.find((p) => p.id === id)!;
    lines.push(`${i + 1}. ${safeField(p.name)} [${p.id}]`);
    if (p.variantLabel) lines.push(`   Variant: ${safeField(p.variantLabel)}`);
    lines.push(
      `   Unit: ${safeField(p.sellingUnit!)}`,
      `   Qty: ${qty}`,
      `   Unit price: ${rupees(p.pricePaise!)}`,
      `   Line amount: ${rupees(p.pricePaise! * qty)}`,
      "",
    );
  });
  lines.push(
    `Total units: ${calculated.units}`,
    `Product subtotal: ${rupees(calculated.subtotal)}`,
    `Delivery / fulfilment: ${calculated.delivery === null ? "seller to confirm" : rupees(calculated.delivery)}`,
  );
  if (calculated.tax !== null)
    lines.push(`${c.tax!.label}: ${rupees(calculated.tax)}`);
  lines.push(`${calculated.label}: ${calculated.text}`);
  if (clean.notes) lines.push("", `Notes: ${clean.notes}`);
  lines.push(
    "",
    "Please confirm availability, fulfilment, applicable charges, and the final payable amount.",
  );
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
