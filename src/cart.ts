import { useEffect, useState } from "react";
import type { Business, Cart, Product, Snapshot } from "./model";
import { blockedReason, quantity, rupees, totals } from "./pricing";

// v2: product IDs are now the sheet's Product IDs. The v1 cart held the old catalogue's ids and is
// discarded when found.
export const CART_KEY = "diwali-cart-v2";
const LEGACY_CART_KEYS = ["diwali-cart-v1"];

export type SavedCart = {
  cart: Cart;
  coupon: string;
  // Unit price (paise) the customer last saw for each item, to report later price changes.
  seen: Record<string, number>;
  // Name the customer saw for each item, so a product that later disappears from the sheet can
  // still be shown by name rather than by ID.
  names: Record<string, string>;
  notices: string[];
};

export function restore(raw: string | null, config: Business): SavedCart {
  const out: SavedCart = { cart: {}, coupon: "", seen: {}, names: {}, notices: [] };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed.schema !== 2 ||
      !parsed.items ||
      typeof parsed.items !== "object" ||
      Array.isArray(parsed.items)
    )
      throw Error();
    // Unknown or hidden products are kept (and flagged once the catalogue loads) rather than
    // silently dropped; only corrupt quantities are discarded.
    for (const [id, qty] of Object.entries(parsed.items)) {
      const n = quantity(qty, config.maxQuantity);
      if (n === null) out.notices.push("An invalid saved quantity was removed.");
      else out.cart[id] = n;
    }
    if (typeof parsed.coupon === "string") out.coupon = parsed.coupon.slice(0, 40);
    if (parsed.seen && typeof parsed.seen === "object")
      for (const [id, v] of Object.entries(parsed.seen))
        if (id in out.cart && Number.isSafeInteger(v) && (v as number) > 0)
          out.seen[id] = v as number;
    if (parsed.names && typeof parsed.names === "object")
      for (const [id, v] of Object.entries(parsed.names))
        if (id in out.cart && typeof v === "string" && v.length <= 300)
          out.names[id] = v;
  } catch {
    return {
      cart: {},
      coupon: "",
      seen: {},
      names: {},
      notices: ["Saved cart could not be read. Started with an empty cart."],
    };
  }
  out.notices = [...new Set(out.notices)];
  return out;
}

export function useCart(
  config: Business,
  announce: (s: string) => void,
) {
  const [initial] = useState<SavedCart>(() => {
    try {
      for (const k of LEGACY_CART_KEYS) localStorage.removeItem(k);
      return restore(localStorage.getItem(CART_KEY), config);
    } catch {
      return {
        cart: {},
        coupon: "",
        seen: {},
        names: {},
        notices: ["Browser storage is unavailable. Your cart lasts for this visit."],
      };
    }
  });
  const [cart, setCart] = useState<Cart>(initial.cart);
  const [coupon, setCouponState] = useState(initial.coupon);
  const [seen, setSeen] = useState<Record<string, number>>(initial.seen);
  const [names, setNames] = useState<Record<string, string>>(initial.names);
  const [notice, setNotice] = useState(initial.notices.join(" "));
  const persist = (
    c: Cart,
    code: string,
    s: Record<string, number>,
    n: Record<string, string>,
  ) => {
    try {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify({ schema: 2, items: c, coupon: code, seen: s, names: n }),
      );
    } catch {
      setNotice("Browser storage is unavailable. Your cart lasts for this visit.");
    }
  };
  // `prices` records the unit price the customer is looking at, so a later change is reported.
  const save = (
    next: Cart,
    prices: Record<string, number> = {},
    labels: Record<string, string> = {},
  ) => {
    const keep = <T,>(o: Record<string, T>) =>
      Object.fromEntries(Object.entries(o).filter(([id]) => id in next));
    const nextSeen = keep({ ...seen, ...prices });
    const nextNames = keep({ ...names, ...labels });
    setCart(next);
    setSeen(nextSeen);
    setNames(nextNames);
    persist(next, coupon, nextSeen, nextNames);
  };
  const setCoupon = (code: string) => {
    const v = code.slice(0, 40);
    setCouponState(v);
    persist(cart, v, seen, names);
  };
  // The customer has seen the current prices (opened checkout or accepted the changes).
  const acknowledge = (products: Product[]) => {
    const prices = Object.fromEntries(
      products
        .filter((p) => p.id in cart && p.pricePaise !== null)
        .map((p) => [p.id, p.pricePaise as number]),
    );
    // Names of items the sheet no longer lists are kept, so they stay recognisable.
    const labels = Object.fromEntries(
      Object.entries({
        ...names,
        ...Object.fromEntries(products.map((p) => [p.id, p.name])),
      }).filter(([id]) => id in cart),
    );
    setSeen(prices);
    setNames(labels);
    persist(cart, coupon, prices, labels);
  };
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key !== CART_KEY) return;
      const restored = restore(event.newValue, config);
      setCart(restored.cart);
      setCouponState(restored.coupon);
      setSeen(restored.seen);
      setNames(restored.names);
      setNotice(restored.notices.join(" "));
      announce("Cart updated from another tab.");
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [config, announce]);
  function update(p: Product, value: unknown) {
    const n = quantity(value, config.maxQuantity);
    if (n === null) {
      announce(`Enter a whole quantity from 1 to ${config.maxQuantity}.`);
      return false;
    }
    const reason = blockedReason(p, config);
    if (reason) {
      announce(`${p.name}: ${reason}.`);
      return false;
    }
    save({ ...cart, [p.id]: n }, { [p.id]: p.pricePaise! }, { [p.id]: p.name });
    announce(`${p.name}: ${n} units selected.`);
    return true;
  }
  return { cart, coupon, setCoupon, seen, names, save, update, acknowledge, notice };
}

// ---- Reviewing what the customer is about to order ----

export type LineState = "ok" | "out-of-stock" | "hidden" | "removed" | "no-price";
export type OrderSummary = {
  lines: {
    id: string;
    name: string;
    qty: number;
    pricePaise: number | null;
    piecesPerPack: number | null;
    shots: number | null;
    state: LineState;
  }[];
  subtotal: number;
  discount: number;
  total: number; // merchandise total after the offer
  offer: string | null; // identity: name + code + terms
  offerLabel: string | null;
  whatsapp: string | null;
  shopName: string | null;
};

export function lineState(p: Product | undefined): LineState {
  if (!p) return "removed";
  if (!p.visible) return "hidden";
  if (p.pricePaise === null) return "no-price";
  return p.inStock ? "ok" : "out-of-stock";
}

export function summarize(
  cart: Cart,
  snapshot: Snapshot,
  config: Business,
  coupon: string,
  names: Record<string, string> = {},
): OrderSummary {
  const byId = new Map(snapshot.products.map((p) => [p.id, p]));
  const t = totals(cart, snapshot.products, snapshot.offers, config, undefined, coupon);
  const o = t.offer.offer;
  return {
    lines: Object.entries(cart).map(([id, qty]) => {
      const p = byId.get(id);
      return {
        id,
        name: p?.name ?? names[id] ?? id,
        qty,
        pricePaise: p?.pricePaise ?? null,
        piecesPerPack: p?.piecesPerPack ?? null,
        shots: p?.shots ?? null,
        state: lineState(p),
      };
    }),
    subtotal: t.subtotal,
    discount: t.discount,
    total: t.afterDiscount,
    offer: o ? [o.mode, o.name, o.code ?? "", o.type, o.value].join("|") : null,
    offerLabel: o ? (o.mode === "coupon" ? `${o.name} (${o.code})` : o.name) : null,
    whatsapp: snapshot.settings.whatsapp,
    shopName: snapshot.settings.shopName,
  };
}

const stateText: Record<LineState, string> = {
  ok: "available",
  "out-of-stock": "out of stock",
  hidden: "no longer listed",
  removed: "no longer listed",
  "no-price": "missing a price",
};

/** Plain-language list of what differs between two summaries; empty when nothing material did. */
export function diffSummary(a: OrderSummary, b: OrderSummary): string[] {
  const out: string[] = [];
  const before = new Map(a.lines.map((l) => [l.id, l]));
  const after = new Map(b.lines.map((l) => [l.id, l]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const x = before.get(id), y = after.get(id);
    if (!x || !y) {
      out.push(`${(y ?? x)!.name} was ${y ? "added to" : "removed from"} your order.`);
      continue;
    }
    // A product that vanished from the sheet has no name or price left to compare.
    const gone = y.state === "removed";
    const label = gone ? x.name : y.name;
    if (!gone && x.name !== y.name) out.push(`${x.name} is now called ${y.name}.`);
    if (x.qty !== y.qty) out.push(`${label}: quantity changed from ${x.qty} to ${y.qty}.`);
    if (x.state !== y.state) out.push(`${label} is now ${stateText[y.state]}.`);
    if (!gone && x.pricePaise !== y.pricePaise)
      out.push(
        `${label}: price changed from ${x.pricePaise === null ? "none" : rupees(x.pricePaise)} to ${y.pricePaise === null ? "none" : rupees(y.pricePaise)}.`,
      );
    if (!gone && (x.piecesPerPack !== y.piecesPerPack || x.shots !== y.shots))
      out.push(`${label}: pack details changed.`);
  }
  if (a.offer !== b.offer || a.discount !== b.discount)
    out.push(
      `Offer changed: ${a.offerLabel ? `${a.offerLabel}, −${rupees(a.discount)}` : "none"} → ${b.offerLabel ? `${b.offerLabel}, −${rupees(b.discount)}` : "none"}.`,
    );
  if (a.subtotal !== b.subtotal) out.push(`Subtotal changed from ${rupees(a.subtotal)} to ${rupees(b.subtotal)}.`);
  if (a.total !== b.total) out.push(`Total changed from ${rupees(a.total)} to ${rupees(b.total)}.`);
  if (a.whatsapp !== b.whatsapp) out.push("The WhatsApp number your order goes to has changed.");
  if (a.shopName !== b.shopName) out.push("The shop name has changed.");
  return out;
}

/** Price changes since the customer last saw their items (for passive notices). */
export function priceChanges(
  cart: Cart,
  seen: Record<string, number>,
  products: Product[],
): string[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const id of Object.keys(cart)) {
    const p = byId.get(id);
    if (p && p.pricePaise !== null && seen[id] !== undefined && seen[id] !== p.pricePaise)
      out.push(`${p.name}: price changed from ${rupees(seen[id])} to ${rupees(p.pricePaise)}.`);
  }
  return out;
}
