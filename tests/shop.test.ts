import { describe, expect, it } from "vitest";
import { business, config } from "../src/business";
import { deriveCategories, filterProducts, matches } from "../src/catalogue";
import { diffSummary, priceChanges, restore, summarize } from "../src/cart";
import { emptyBuyer, type Business, type Buyer, type Snapshot } from "../src/model";
import { blockedReason, orderingAllowed, quantity, totals } from "../src/pricing";
import { parseSheet } from "../src/sheet/parse";
import { RECIPIENT_ERROR, makeRequest } from "../src/whatsapp";
import { validateBuyer } from "../src/buyer";
import { isDirectImage, resolveImages } from "../src/images";
import { product, sheet, type O, type P } from "./helpers/sheet";

const snap = (products: P[], offers: O[] = [], settings?: [string, string][]): Snapshot =>
  parseSheet(sheet({ products, offers, settings })).snapshot;
const buyer: Buyer = { ...emptyBuyer, name: "Asha Rao", mobile: "98765 43210", method: "whatsapp", acknowledged: true, notes: "Evening please" };
const tenPercent: O = { name: "Ten", mode: "Coupon", code: "TEN", type: "Percent", value: "10", enabled: "YES", notes: "SECRET OFFER NOTE" };

describe("private-audience gates are unchanged", () => {
  it("ordering stays enabled only for the private audience, with no verification flags raised", () => {
    expect(business.privateAudience).toBe(true);
    expect(orderingAllowed(config)).toBe(true);
    expect(Object.values(business.verification).some(Boolean)).toBe(false);
    expect(business.publicCatalogueVerified).toBe(false);
    const publicUnverified: Business = { ...config, privateAudience: false };
    expect(orderingAllowed(publicUnverified)).toBe(false);
  });
});

describe("categories come from the visible products", () => {
  const s = snap([
    product(1, { category: "Anar bomb" }), product(2, { category: "Anar Bomb" }), product(3, { category: " anar   bomb " }),
    product(4, { category: "Bomb - Big" }), product(5, { category: "Hidden only", show: "NO" }), product(6, { category: "" }),
  ]);
  it("merges whitespace/case-only duplicates, not different wording; hides empty categories", () => {
    expect(deriveCategories(s.products)).toEqual([
      { key: "anar bomb", label: "Anar bomb" },
      { key: "bomb - big", label: "Bomb - Big" },
    ]);
  });
  it("a product with a brand-new category adds a chip with no code change", () => {
    const next = snap([...[1, 2].map((n) => product(n)), product(3, { category: "Brand new" })]);
    expect(deriveCategories(next.products).map((c) => c.label)).toEqual(["Sky shot", "Brand new"]);
  });
  it("filters by category key and never returns hidden products", () => {
    expect(filterProducts(s.products, "", "anar bomb", "source").map((p) => p.id)).toEqual(["PRD-0001", "PRD-0002", "PRD-0003"]);
    expect(filterProducts(s.products, "", "all", "source").map((p) => p.id)).not.toContain("PRD-0005");
    expect(filterProducts(s.products, "hidden", "all", "source")).toEqual([]);
  });
  it("searches name, category, description and ID; sorts by sheet order, price, name", () => {
    const t = snap([
      product(1, { name: "Zed", price: "₹30", desc: "loud one" }), product(2, { name: "Alpha", price: "₹10" }), product(3, { name: "Mid", price: "₹20", category: "Rockets" }),
    ]);
    expect(t.products.filter((p) => matches(p, "loud")).map((p) => p.id)).toEqual(["PRD-0001"]);
    expect(t.products.filter((p) => matches(p, "rock")).map((p) => p.id)).toEqual(["PRD-0003"]);
    expect(t.products.filter((p) => matches(p, "prd-0002")).map((p) => p.id)).toEqual(["PRD-0002"]);
    const ids = (sort: string) => filterProducts(t.products, "", "all", sort).map((p) => p.id);
    expect(ids("source")).toEqual(["PRD-0001", "PRD-0002", "PRD-0003"]);
    expect(ids("low")).toEqual(["PRD-0002", "PRD-0003", "PRD-0001"]);
    expect(ids("high")).toEqual(["PRD-0001", "PRD-0003", "PRD-0002"]);
    expect(ids("name")).toEqual(["PRD-0002", "PRD-0003", "PRD-0001"]);
  });
});

describe("ordering rules", () => {
  const s = snap([
    product(1), product(2, { stock: "FALSE" }), product(3, { show: "NO" }), product(4, { price: "" }), product(5, { stock: "" }),
  ]);
  const reason = (id: string) => blockedReason(s.products.find((p) => p.id === id), config);
  it("orders only visible, priced, in-stock products", () => {
    expect(reason("PRD-0001")).toBeNull();
    expect(reason("PRD-0002")).toBe("Out of stock");
    expect(reason("PRD-0003")).toBe("No longer available");
    expect(reason("PRD-0004")).toBe("Price unavailable");
    expect(reason("PRD-0005")).toBe("Out of stock"); // blank stock is not available
    expect(blockedReason(undefined, config)).toBe("No longer available");
  });
  it("has no numeric quantity: any quantity up to the documented cap is accepted", () => {
    expect(quantity(99, config.maxQuantity)).toBe(99);
    expect(quantity(100, config.maxQuantity)).toBeNull();
    expect(quantity("12", config.maxQuantity)).toBe(12);
    expect(quantity("1.5", config.maxQuantity)).toBeNull();
    expect(quantity(0, config.maxQuantity)).toBeNull();
  });
  it("totals count only orderable lines and apply one offer", () => {
    const t = totals({ "PRD-0001": 3, "PRD-0002": 5, "PRD-0099": 1 }, s.products, [], config);
    expect(t).toMatchObject({ subtotal: 30000, units: 3, discount: 0, afterDiscount: 30000 });
    const withOffer = snap([product(1, { price: "₹1,000" })], [tenPercent]);
    const u = totals({ "PRD-0001": 2 }, withOffer.products, withOffer.offers, config, undefined, " ten ");
    expect(u).toMatchObject({ subtotal: 200000, discount: 20000, afterDiscount: 180000, couponCode: "TEN", offerName: "Ten" });
  });
  it("uses integer paise throughout (no float drift)", () => {
    const t = snap([product(1, { price: "₹0.10" })]);
    expect(totals({ "PRD-0001": 3 }, t.products, [], config).subtotal).toBe(30);
  });
});

describe("cart persistence and reconciliation", () => {
  it("restores IDs, quantities and coupon; keeps unknown IDs instead of dropping them", () => {
    const raw = JSON.stringify({ schema: 2, items: { "PRD-0001": 2, "GONE-1": 1, "PRD-0002": 0, "PRD-0003": "x" }, coupon: "TEN", seen: { "PRD-0001": 10000, "GONE-1": -5 } });
    const r = restore(raw, config);
    expect(r.cart).toEqual({ "PRD-0001": 2, "GONE-1": 1 });
    expect(r.coupon).toBe("TEN");
    expect(r.seen).toEqual({ "PRD-0001": 10000 });
    expect(r.notices.join(" ")).toMatch(/invalid saved quantity/);
  });
  it("discards the old cart format and corrupt storage", () => {
    expect(restore(JSON.stringify({ schema: 1, items: { "dc-001": 2 } }), config).cart).toEqual({});
    expect(restore("{broken", config).notices[0]).toMatch(/could not be read/);
    expect(restore(null, config).cart).toEqual({});
  });
  const before = snap([product(1, { price: "₹100" }), product(2), product(3)], [{ ...tenPercent, enabled: "YES" }]);
  const cart = { "PRD-0001": 2, "PRD-0002": 1, "PRD-0003": 1 };
  const sum = (s: Snapshot, coupon = "TEN") => summarize(cart, s, config, coupon);
  it("reports no change for identical data", () => {
    expect(diffSummary(sum(before), sum(snap([product(1, { price: "₹100" }), product(2), product(3)], [tenPercent])))).toEqual([]);
  });
  it("reports price, stock, hiding, removal, name and pack changes", () => {
    const after = snap(
      [product(1, { price: "₹120", pieces: "5" }), product(2, { stock: "FALSE" }), product(3, { show: "NO" })],
      [tenPercent],
    );
    const text = diffSummary(sum(before), sum(after)).join("\n");
    expect(text).toMatch(/Product 1: price changed from ₹100 to ₹120/);
    expect(text).toMatch(/Product 1: pack details changed/);
    expect(text).toMatch(/Product 2 is now out of stock/);
    expect(text).toMatch(/Product 3 is now no longer listed/);
    expect(text).toMatch(/Total changed/);
    const gone = snap([product(1, { price: "₹100" })], [tenPercent]);
    expect(diffSummary(sum(before), sum(gone)).join("\n")).toMatch(/Product 2 is now no longer listed/);
  });
  it("reports a changed or disabled coupon and a changed automatic offer", () => {
    const disabled = snap([product(1, { price: "₹100" }), product(2), product(3)], [{ ...tenPercent, enabled: "NO" }]);
    expect(diffSummary(sum(before), sum(disabled)).join("\n")).toMatch(/Offer changed: Ten \(TEN\), −₹40 → none/);
    const autoBetter = snap([product(1, { price: "₹100" }), product(2), product(3)], [tenPercent, { name: "Festival", mode: "Automatic", type: "Percent", value: "20", enabled: "YES" }]);
    expect(diffSummary(sum(before), sum(autoBetter)).join("\n")).toMatch(/Offer changed.*Festival/);
  });
  it("flags a changed coupon or WhatsApp number even when the total stays the same", () => {
    const sameTotal = (over: Partial<O>) => snap([product(1, { price: "₹100" }), product(2), product(3)], [{ ...tenPercent, ...over }, { name: "Alt", mode: "Coupon", code: "ALT", type: "Fixed", value: "40", enabled: "YES" }]);
    // 10% of ₹400 and ₹40 off are the same amount: 'TEN' vs 'ALT' only differ in identity.
    const a = summarize(cart, sameTotal({}), config, "TEN");
    const b = summarize(cart, sameTotal({}), config, "ALT");
    expect(a.total).toBe(b.total);
    expect(diffSummary(a, b).join("\n")).toMatch(/Offer changed/);
    const moved = snap([product(1, { price: "₹100" }), product(2), product(3)], [tenPercent], [["WhatsApp number", "919000000000"], ["Shop name", "Test Shop"]]);
    const d = diffSummary(sum(before), sum(moved));
    expect(d).toEqual(["The WhatsApp number your order goes to has changed."]);
    const renamed = snap([product(1, { price: "₹100" }), product(2), product(3)], [tenPercent], [["Shop name", "Renamed"], ["WhatsApp number", "919876543210"]]);
    expect(diffSummary(sum(before), sum(renamed))).toEqual(["The shop name has changed."]);
  });
  it("tells a returning customer about price changes since they last saw their items", () => {
    expect(priceChanges(cart, { "PRD-0001": 5000, "PRD-0002": 10000 }, before.products)).toEqual([
      "Product 1: price changed from ₹50 to ₹100.",
    ]);
  });
});

describe("WhatsApp request", () => {
  const s = snap(
    [product(1, { price: "₹1,000", pieces: "5", shots: "100" }), product(2, { price: "₹50", notes: "NEVER SHOW THIS" })],
    [tenPercent],
  );
  const cart = { "PRD-0001": 2, "PRD-0002": 1 };
  it("includes the shop, buyer, products with ID/pack/shots, prices, offer and totals", () => {
    const r = makeRequest(cart, s, buyer, config, "ten");
    const text = r.message;
    expect(text).toMatch(/Shop: Test Shop/);
    expect(text).toMatch(/1\. \*Product 1\* \(ID: PRD-0001\) — Qty: 2 × ₹1,000 = ₹2,000/);
    expect(text).toMatch(/5 pieces per pack · 100 shots/);
    expect(text).toMatch(/2\. \*Product 2\* \(ID: PRD-0002\) — Qty: 1 × ₹50 = ₹50/);
    expect(text).toMatch(/Subtotal: ₹2,050/);
    expect(text).toMatch(/Offer: Ten\nCoupon: TEN\nDiscount: −₹205/);
    expect(text).toMatch(/Merchandise total \(before any delivery charge\): ₹1,845/);
    expect(text).toMatch(/\*Buyer:\* Asha Rao/);
    expect(text).toMatch(/\*Mobile:\* 9876543210/);
    expect(text).not.toMatch(/NEVER SHOW THIS|SECRET OFFER NOTE/);
    expect(text).not.toMatch(/delivery charge:|paid|confirmed by/i);
  });
  it("sends to the number in SHOP SETTINGS only, and encodes the message", () => {
    const r = makeRequest(cart, s, { ...buyer, notes: "Ünïcode & symbols ₹ 100%" }, config, "");
    expect(r.url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(r.url.split("text=")[1])).toBe(r.message);
    expect(r.message).toContain("Ünïcode & symbols ₹ 100%");
    const other = snap([product(1)], [], [["WhatsApp number", "919000000001"]]);
    expect(makeRequest({ "PRD-0001": 1 }, other, buyer, config, "").url).toContain("wa.me/919000000001");
  });
  it("omits the shop line when the sheet has no shop name", () => {
    const noShop = snap([product(1)], [], [["WhatsApp number", "919876543210"], ["Shop name", ""]]);
    expect(makeRequest({ "PRD-0001": 1 }, noShop, buyer, config, "").message).not.toMatch(/Shop:/);
  });
  it("refuses with a recoverable error when the number is missing or invalid (no fallback)", () => {
    for (const settings of [[["WhatsApp number", ""]], [["WhatsApp number", "12345"]], []] as [string, string][][]) {
      const bad = snap([product(1)], [], settings);
      expect(() => makeRequest({ "PRD-0001": 1 }, bad, buyer, config, "")).toThrow(RECIPIENT_ERROR);
    }
  });
  it("refuses unorderable lines and an invalid buyer", () => {
    const t = snap([product(1, { stock: "FALSE" }), product(2)]);
    expect(() => makeRequest({ "PRD-0001": 1 }, t, buyer, config, "")).toThrow(/not ready/);
    expect(() => makeRequest({ "PRD-0099": 1 }, t, buyer, config, "")).toThrow(/not ready/);
    expect(() => makeRequest({ "PRD-0002": 1 }, t, { ...buyer, name: "" }, config, "")).toThrow(/not ready/);
    expect(() => makeRequest({}, t, buyer, config, "")).toThrow(/not ready/);
  });
  it("falls back to a short link for very long orders but keeps the full text", () => {
    const many = snap(Array.from({ length: 80 }, (_, i) => product(i + 1, { name: `A fairly long product name number ${i + 1}` })));
    const lots = Object.fromEntries(many.products.map((p) => [p.id, 3]));
    const r = makeRequest(lots, many, buyer, config, "");
    expect(r.long).toBe(true);
    expect(r.url.length).toBeLessThan(config.urlThreshold);
    expect(r.message).toContain("A fairly long product name number 80");
  });
  it("reuses the draft only for identical data", () => {
    const a = makeRequest(cart, s, buyer, config, "");
    expect(makeRequest(cart, s, buyer, config, "", a)).toBe(a);
    const changed = snap([product(1, { price: "₹1,001" }), product(2)], [tenPercent]);
    expect(makeRequest(cart, changed, buyer, config, "", a)).not.toBe(a);
  });
  it("keeps delivery address, fulfilment and charge lines for a delivery method", () => {
    const delivery: Business = {
      ...config,
      fulfilment: [{ id: "d", label: "Delivery", type: "delivery", verified: true, chargePaise: 5000, servicePins: ["110001"] }],
    };
    const b = { ...buyer, method: "d", address: "12 MG Road", locality: "Central", city: "Delhi", state: "Delhi", pin: "110001" };
    expect(validateBuyer(b, delivery)).toEqual({});
    expect(validateBuyer({ ...b, pin: "560001" }, delivery).pin).toMatch(/outside/);
    const m = makeRequest({ "PRD-0001": 1 }, s, b, delivery, "").message;
    expect(m).toMatch(/\*Address:\* 12 MG Road, Central, Delhi, Delhi, 110001/);
    expect(m).toMatch(/Fulfilment charge: ₹50/);
  });
});

describe("images", () => {
  const p = (links: string[]) => ({ imageLinks: links });
  it("prefers a direct image URL; a saved copy is used only for a link still in the sheet", () => {
    const index = { "https://prnt.sc/abc": "images/x.webp", "https://prnt.sc/removed": "images/old.webp" };
    expect(resolveImages(p(["https://cdn.example/a.jpg", "https://prnt.sc/abc", "https://prnt.sc/new"]), index)).toEqual({
      sources: ["https://cdn.example/a.jpg", `${import.meta.env.BASE_URL}images/x.webp`],
      pages: ["https://prnt.sc/new"],
    });
    expect(resolveImages(p(["https://prnt.sc/other"]), index).sources).toEqual([]);
  });
  it("a direct URL wins over a stale saved copy", () => {
    expect(resolveImages(p(["https://i.imgur.com/abc"]), { "https://i.imgur.com/abc": "images/x.webp" }).sources).toEqual(["https://i.imgur.com/abc"]);
  });
  it("ignores index entries that point outside images/", () => {
    expect(resolveImages(p(["https://prnt.sc/a"]), { "https://prnt.sc/a": "../../etc/x.webp" }).sources).toEqual([]);
  });
  it("recognises image files and hosts", () => {
    expect(isDirectImage("https://a.example/p.PNG?x=1")).toBe(true);
    expect(isDirectImage("https://prnt.sc/abc")).toBe(false);
    expect(isDirectImage("not a url")).toBe(false);
  });
});
