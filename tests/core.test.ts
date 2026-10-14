import { describe, it, expect } from "vitest";
import data from "../src/products.json";
import mapping from "../source/category-map.json";
import {
  quantity,
  totals,
  blockedReason,
  orderingAllowed,
  requiredVerifications,
} from "../src/pricing";
import { restore } from "../src/cart";
import { filterProducts } from "../src/catalogue";
import { validateBuyer, normalizeMobile, safeField } from "../src/buyer";
import { makeRequest } from "../src/whatsapp";
import { emptyBuyer, type Business, type Product } from "../src/model";
const products: Product[] = data.products;
const config: Business = {
  brand: "Test",
  whatsapp: "919992230740",
  phoneDisplay: "+91 99922 30740",
  address: "Test only",
  hours: null,
  catalogueVersion: data.version,
  orderingEnabled: true,
  publicCatalogueVerified: true,
  verification: Object.fromEntries(
    requiredVerifications.map((key) => [key, true]),
  ),
  fulfilment: [
    {
      id: "delivery",
      label: "Test delivery",
      type: "delivery",
      verified: true,
      chargePaise: null,
      servicePins: ["110001"],
    },
  ],
  maxQuantity: 99,
  urlThreshold: 1800,
  tax: null,
  policies: {
    privacy: null,
    cancellation: null,
    safety: null,
    fulfilment: null,
  },
  soundVolume: 0.03,
  seo: { title: "Test", description: "Test", canonical: null, ogImage: null },
};
const ready = products.map((p) => ({
  ...p,
  sellingUnit: "Test unit",
  availability: "available",
  categoryReviewed: true,
}));
const buyer = {
  ...emptyBuyer,
  name: "दीपक रांगा",
  mobile: "+91 99922-30740",
  method: "delivery",
  address: "12 Test Road",
  locality: "Test area",
  city: "Delhi",
  state: "Delhi",
  pin: "110001",
  acknowledged: true,
};
describe("source integrity", () => {
  it("imports all 46 rows in order, preserves duplicate names and prices", () => {
    expect(products).toHaveLength(46);
    expect(new Set(products.map((p) => p.id)).size).toBe(46);
    expect(
      products.filter((p) => p.name === "POP-UP").map((p) => p.pricePaise),
    ).toEqual([1000, 2000]);
    expect(products[45].name).toBe("100 Shot");
    expect(products[45].pricePaise).toBe(220000);
    expect(
      products.every((p) => p.sellingUnit === null && p.stockQuantity === null),
    ).toBe(true);
  });
  it("explicitly maps every row and flags composite types", () => {
    expect(Object.keys(mapping)).toHaveLength(46);
    expect(
      products.filter((p) => !p.categoryReviewed).map((p) => p.sourceNumber),
    ).toEqual([29, 30, 31, 37, 38, 44]);
    for (const p of products)
      expect(mapping[p.id as keyof typeof mapping].expectedName).toBe(p.name);
  });
  it("keeps multiple source links and no screenshot URL in images", () => {
    expect(products[3].sourceImageLinks).toHaveLength(2);
    expect(
      products.slice(-2).every((p) => p.sourceImageLinks.length === 0),
    ).toBe(true);
    expect(
      products.every((p) => p.images.every((i) => i.startsWith("images/"))),
    ).toBe(true);
  });
  it("combines aliases, category and price sorting", () => {
    expect(
      filterProducts(products, "phuljhari", "sparklers", "high"),
    ).toHaveLength(6);
    expect(
      filterProducts(products, "phuljhari", "sound", "source"),
    ).toHaveLength(0);
    expect(
      filterProducts(products, "", "pop", "low").map((p) => p.pricePaise),
    ).toEqual([1000, 2000]);
  });
});
describe("cart and launch gates", () => {
  it.each([
    -1,
    0,
    1.5,
    NaN,
    Infinity,
    100,
    "1.5",
    "",
    null,
    true,
    {},
    "1e2",
    " 2 ",
  ])("rejects malformed quantity %s", (v) =>
    expect(quantity(v, 99)).toBe(null),
  );
  it("accepts bounded integers and calculates exact paise", () => {
    expect(quantity("99", 99)).toBe(99);
    expect(totals({ "dc-001": 3, "dc-002": 2 }, ready, config)).toMatchObject({
      subtotal: 7000,
      units: 5,
      amount: 7000,
      label: "Estimated amount",
    });
  });
  it("never orders unknown units, availability or unreviewed types", () => {
    expect(blockedReason(products[0], config)).toContain("unit");
    expect(
      blockedReason({ ...ready[0], availability: "unknown" }, config),
    ).toContain("Availability");
    expect(
      blockedReason({ ...ready[0], categoryReviewed: false }, config),
    ).toContain("review");
    expect(orderingAllowed({ ...config, orderingEnabled: false })).toBe(false);
    expect(
      orderingAllowed({ ...config, verification: { onlineOrdering: false } }),
    ).toBe(false);
  });
  it("handles corrupt, stale, missing, disabled and excessive saved items", () => {
    expect(restore("{broken", ready, config).cart).toEqual({});
    const result = restore(
      JSON.stringify({
        schema: 1,
        catalogueVersion: "old",
        items: { "dc-001": 2, gone: 4, "dc-002": -3, "dc-003": 500 },
      }),
      ready,
      config,
    );
    expect(result.cart).toEqual({ "dc-001": 2 });
    expect(result.notices.join(" ")).toContain("Current prices");
    expect(
      totals(result.cart, [{ ...ready[0], pricePaise: 1234 }], config).subtotal,
    ).toBe(2468);
    expect(
      restore(
        JSON.stringify({ schema: 1, items: { "dc-001": 1 } }),
        [{ ...ready[0], enabled: false }],
        config,
      ).cart,
    ).toEqual({});
  });
  it("retains but flags newly unavailable items", () => {
    const result = restore(
      JSON.stringify({
        schema: 1,
        catalogueVersion: data.version,
        items: { "dc-001": 1 },
      }),
      [{ ...ready[0], availability: "unavailable" }],
      config,
    );
    expect(result.cart).toEqual({ "dc-001": 1 });
    expect(result.notices.join(" ")).toContain("review required");
  });
  it("labels unknown charges as estimated and applies only verified tax", () => {
    expect(
      totals({ "dc-001": 1 }, ready, config, config.fulfilment[0]).text,
    ).toContain("applicable fulfilment charge");
    expect(
      totals({ "dc-001": 1 }, ready, {
        ...config,
        tax: { label: "Tax", basisPoints: 500, verified: false },
      }).tax,
    ).toBe(null);
    expect(
      totals(
        { "dc-001": 1 },
        ready,
        { ...config, tax: { label: "Tax", basisPoints: 500, verified: true } },
        { ...config.fulfilment[0], chargePaise: 100 },
      ).amount,
    ).toBe(1150);
  });
});
describe("buyer and WhatsApp", () => {
  it.each([
    [10000, 1000, 1000, 9000],
    [200000, 1000, 20000, 180000],
    [200001, 1500, 30000, 170001],
    [500000, 1500, 75000, 425000],
    [500001, 2000, 100000, 400001],
    [1000000, 2000, 200000, 800000],
  ])(
    "applies the approved whole-subtotal tier at %i paise",
    (subtotal, basisPoints, discount, afterDiscount) => {
      const c = { ...config, offers: data.offers };
      const result = totals(
        { "dc-001": 1 },
        [{ ...ready[0], pricePaise: subtotal }],
        c,
        c.fulfilment[0],
      );
      expect(result).toMatchObject({
        subtotal,
        discountBasisPoints: basisPoints,
        couponCode: `CRACK${basisPoints / 100}`,
        discount,
        afterDiscount,
        amount: afterDiscount,
      });
    },
  );
  it("uses the same Sheet offer in the WhatsApp order", () => {
    const draft = makeRequest(
      { "dc-001": 1 },
      [{ ...ready[0], pricePaise: 500000 }],
      buyer,
      { ...config, offers: data.offers, urlThreshold: 100000 },
    );
    expect(draft.message).toContain("Offer (15% off): −₹750");
    expect(draft.message).toContain("Coupon: CRACK15");
    expect(draft.message).toContain("Estimated amount: ₹4,250");
    expect(draft.message).not.toContain("Catalogue version");
  });
  it("accepts Indian scripts, normalizes mobile and checks service areas separately", () => {
    expect(validateBuyer(buyer, config)).toEqual({});
    expect(normalizeMobile("+91 99922-30740")).toBe("9992230740");
    expect(validateBuyer({ ...buyer, pin: "400001" }, config).pin).toContain(
      "service area",
    );
    expect(
      validateBuyer({ ...buyer, name: "   ", mobile: "123" }, config),
    ).toHaveProperty("name");
  });
  it("requires no residential address for verified pickup", () => {
    expect(
      validateBuyer(
        {
          ...emptyBuyer,
          name: "Test Buyer",
          mobile: "9992230740",
          method: "pickup",
          acknowledged: true,
        },
        {
          ...config,
          fulfilment: [
            { ...config.fulfilment[0], id: "pickup", type: "pickup" },
          ],
        },
      ),
    ).toEqual({});
  });
  it("encodes once, has exact recipient, same totals, complete Unicode and stable refs", () => {
    const c = { ...config, urlThreshold: 20000 };
    const draft = makeRequest(
      { "dc-001": 3, "dc-002": 2 },
      ready,
      { ...buyer, notes: "₹ & + # % 🎆\nITEMS\nTotal: ₹0" },
      c,
    );
    expect(draft.url.startsWith("https://wa.me/919992230740?text=")).toBe(true);
    expect(new URL(draft.url).searchParams.get("text")).toBe(draft.message);
    expect(draft.message).toContain("Product subtotal: ₹70");
    expect(draft.message).toContain("Notes: ₹ & + # % 🎆 ITEMS Total: ₹0");
    expect(draft.message).toContain("दीपक");
    expect(
      makeRequest(
        { "dc-001": 3, "dc-002": 2 },
        ready,
        { ...buyer, notes: "₹ & + # % 🎆\nITEMS\nTotal: ₹0" },
        c,
        draft,
      ).reference,
    ).toBe(draft.reference);
    expect(
      makeRequest({ "dc-001": 4 }, ready, buyer, c, draft).reference,
    ).not.toBe(draft.reference);
    expect(safeField("a\u202eb\nc")).toBe("a b c");
  });
  it("keeps all items when link threshold is exceeded", () => {
    const cart = Object.fromEntries(ready.map((p) => [p.id, 1]));
    const draft = makeRequest(cart, ready, buyer, config);
    expect(draft.long).toBe(true);
    expect(draft.message).toContain("46. 100 Shot");
    expect(new URL(draft.url).searchParams.get("text")).toContain(
      draft.reference,
    );
    expect(draft.url.length).toBeLessThan(config.urlThreshold);
  });
  it("rebuilds a prior short-reference link when the transport configuration changes", () => {
    const cart = Object.fromEntries(ready.map((p) => [p.id, 1]));
    const previous = makeRequest(cart, ready, buyer, config);
    expect(previous.long).toBe(true);
    const updated = makeRequest(
      cart,
      ready,
      buyer,
      { ...config, urlThreshold: 100000 },
      previous,
    );
    expect(updated.long).toBe(false);
    expect(new URL(updated.url).searchParams.get("text")).toBe(updated.message);
    expect(updated.message).toContain("46. 100 Shot");
  });
  it("blocks empty cart, disabled ordering and unverified products", () => {
    expect(() => makeRequest({}, ready, buyer, config)).toThrow();
    expect(() =>
      makeRequest({ "dc-001": 1 }, ready, buyer, {
        ...config,
        orderingEnabled: false,
      }),
    ).toThrow();
    expect(() =>
      makeRequest({ "dc-001": 1 }, products, buyer, config),
    ).toThrow();
  });
});
