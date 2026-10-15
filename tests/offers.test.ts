import { describe, expect, it } from "vitest";
import type { Offer } from "../src/model";
import { bestOffer, describeOffer, discountFor } from "../src/sheet/offers";

let row = 10;
const offer = (o: Partial<Offer> = {}): Offer => ({
  name: "Offer",
  mode: "coupon",
  code: "TEN",
  type: "percent",
  value: 1000,
  minPaise: null,
  maxPaise: null,
  enabled: true,
  row: row++,
  ...o,
});
const auto = (o: Partial<Offer> = {}) => offer({ mode: "automatic", code: null, name: "Auto", ...o });
const rs = (n: number) => n * 100;

describe("discount maths", () => {
  it("percent: 10 means 10% off, exact paise, half-up rounding", () => {
    expect(discountFor(offer(), rs(1000))).toBe(rs(100));
    expect(discountFor(offer({ value: 1000 }), 1005)).toBe(101); // 100.5 -> 101
    expect(discountFor(offer({ value: 1000 }), 1004)).toBe(100); // 100.4 -> 100
    expect(discountFor(offer({ value: 1250 }), 999)).toBe(125); // 124.875
    expect(discountFor(offer({ value: 1 }), 100)).toBe(0); // 0.01% of ₹1 rounds to nothing
  });
  it("fixed: 100 means ₹100 off, capped so the total never goes negative", () => {
    const fixed = offer({ type: "fixed", value: rs(100) });
    expect(discountFor(fixed, rs(1000))).toBe(rs(100));
    expect(discountFor(fixed, rs(40))).toBe(rs(40));
  });
  it("100% leaves exactly zero", () => {
    expect(discountFor(offer({ value: 10000 }), 12345)).toBe(12345);
  });
  it("says so when a valid coupon saves nothing", () => {
    const r = bestOffer(1, [offer()], "TEN");
    expect(r).toMatchObject({ offer: null, discountPaise: 0, status: "not-eligible" });
    expect(r.message).toMatch(/no saving/);
  });
  it("gives nothing on an empty cart", () => {
    expect(discountFor(offer(), 0)).toBe(0);
    expect(bestOffer(0, [auto()], "").offer).toBeNull();
  });
});

describe("order limits are inclusive and blanks are open", () => {
  const ranged = offer({ minPaise: rs(2000), maxPaise: rs(5000) });
  it.each([
    [rs(1999) + 99, "not-eligible"],
    [rs(2000), "applied"],
    [rs(3500), "applied"],
    [rs(5000), "applied"],
    [rs(5000) + 1, "not-eligible"],
  ])("subtotal %i -> %s", (subtotal, status) => {
    expect(bestOffer(subtotal, [ranged], "ten").status).toBe(status);
  });
  it("blank minimum means no lower limit; blank maximum no upper limit", () => {
    expect(bestOffer(rs(1), [offer({ maxPaise: rs(100) })], "TEN").status).toBe("applied");
    expect(bestOffer(rs(10_000_000), [offer({ minPaise: rs(100) })], "TEN").status).toBe("applied");
  });
  it("explains which limit was missed", () => {
    expect(bestOffer(rs(100), [ranged], "TEN").message).toMatch(/at least ₹2,000/);
    expect(bestOffer(rs(9000), [ranged], "TEN").message).toMatch(/up to ₹5,000/);
  });
  it("applies limits to automatic offers too", () => {
    expect(bestOffer(rs(999), [auto({ minPaise: rs(1000) })], "").offer).toBeNull();
    expect(bestOffer(rs(1000), [auto({ minPaise: rs(1000) })], "").offer?.name).toBe("Auto");
  });
});

describe("coupon entry", () => {
  const list = [offer({ code: "SAVE10" }), offer({ code: "OFF", enabled: false })];
  it("trims and ignores case", () => {
    for (const typed of ["SAVE10", "save10", "  Save10  "]) expect(bestOffer(rs(1000), list, typed).offer?.code).toBe("SAVE10");
  });
  it("reports unknown, disabled and empty input", () => {
    expect(bestOffer(rs(1000), list, "NOPE")).toMatchObject({ status: "unknown", offer: null, discountPaise: 0 });
    expect(bestOffer(rs(1000), list, "off")).toMatchObject({ status: "disabled", offer: null });
    expect(bestOffer(rs(1000), list, "  ")).toMatchObject({ status: "none", offer: null });
  });
  it("never applies a coupon that was not entered, and never a disabled automatic offer", () => {
    expect(bestOffer(rs(1000), list, "").offer).toBeNull();
    expect(bestOffer(rs(1000), [auto({ enabled: false })], "").offer).toBeNull();
  });
});

describe("one best offer, no stacking", () => {
  it("applies the greatest saving", () => {
    const r = bestOffer(rs(1000), [auto({ value: 500, name: "5% auto" }), offer({ value: 1500, code: "BIG" })], "big");
    expect(r.offer?.code).toBe("BIG");
    expect(r.discountPaise).toBe(rs(150)); // not 150 + 50
  });
  it("explains when an automatic offer beats the entered coupon", () => {
    const r = bestOffer(rs(1000), [auto({ value: 2000, name: "Festival 20%" }), offer({ value: 1000, code: "TEN" })], "TEN");
    expect(r).toMatchObject({ status: "beaten-by-automatic", discountPaise: rs(200) });
    expect(r.offer?.name).toBe("Festival 20%");
    expect(r.message).toMatch(/Festival 20%.*bigger saving than TEN/);
  });
  it("compares fixed and percent offers by actual saving", () => {
    const r = bestOffer(rs(500), [auto({ type: "fixed", value: rs(60), name: "₹60" }), offer({ value: 1000 })], "TEN");
    expect(r.offer?.name).toBe("₹60"); // ₹60 > 10% of ₹500
  });
  it("breaks ties deterministically: entered coupon, then automatic, then earlier row", () => {
    const a = auto({ name: "Auto", row: 1 });
    const c = offer({ name: "Coupon", code: "TEN", row: 2 });
    expect(bestOffer(rs(1000), [a, c], "TEN").offer?.name).toBe("Coupon");
    const a1 = auto({ name: "First", row: 5 }), a2 = auto({ name: "Second", row: 9 });
    expect(bestOffer(rs(1000), [a2, a1], "").offer?.name).toBe("First");
    // Same result regardless of list order.
    expect(bestOffer(rs(1000), [c, a], "TEN").offer?.name).toBe("Coupon");
    expect(bestOffer(rs(1000), [a, c], "").offer?.name).toBe("Auto");
  });
  it("overlapping enabled ranges still resolve to one offer", () => {
    const low = auto({ name: "Low", value: 500, minPaise: 0, maxPaise: rs(5000) });
    const high = auto({ name: "High", value: 1000, minPaise: rs(2000) });
    expect(bestOffer(rs(3000), [low, high], "").offer?.name).toBe("High");
    expect(bestOffer(rs(1000), [low, high], "").offer?.name).toBe("Low");
  });
  it("caps a large fixed discount at the subtotal", () => {
    const r = bestOffer(rs(50), [auto({ type: "fixed", value: rs(500) })], "");
    expect(r.discountPaise).toBe(rs(50));
  });
});

describe("describeOffer", () => {
  it("states percent or fixed and the order range", () => {
    expect(describeOffer(offer({ minPaise: rs(2000), maxPaise: rs(5000) }))).toBe("10% off on orders from ₹2,000 to ₹5,000");
    expect(describeOffer(offer({ type: "fixed", value: rs(100), minPaise: rs(500) }))).toBe("₹100 off on orders of ₹500 or more");
  });
});
