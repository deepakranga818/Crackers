import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/sheet/csv";
import { parseCount, parseMoney, parsePercent } from "../src/sheet/money";
import { SheetError, parseSheet, validateSnapshot } from "../src/sheet/parse";
import { product, sheet, toCsv, type O, type P } from "./helpers/sheet";

const parse = (o?: Parameters<typeof sheet>[0]) => parseSheet(sheet(o));
const fails = (text: string, kind: string) => {
  try {
    parseSheet(text);
  } catch (e) {
    expect(e).toBeInstanceOf(SheetError);
    expect((e as SheetError).kind).toBe(kind);
    return e as SheetError;
  }
  throw Error("expected parseSheet to throw");
};
const coupon = (over: O = {}): O => ({
  name: "Ten", mode: "Coupon", code: "TEN", type: "Percent", value: "10", enabled: "YES", ...over,
});

describe("csv", () => {
  it("handles quotes, embedded commas, escaped quotes and multiline cells", () => {
    expect(parseCsv('a,"b,c","say ""hi""","x\ny"\r\nlast,,')).toEqual([
      ["a", "b,c", 'say "hi"', "x\ny"],
      ["last", "", ""],
    ]);
  });
  it("keeps Unicode and ₹, strips a BOM, reads a final row without newline", () => {
    expect(parseCsv("﻿नमस्ते,₹1,500")).toEqual([["नमस्ते", "₹1", "500"]]);
    expect(parseCsv('"₹1,500"')).toEqual([["₹1,500"]]);
  });
});

describe("money, percent, counts", () => {
  it("parses sheet money to integer paise", () => {
    for (const [raw, paise] of [
      ["₹10.00", 1000], ["₹1,500.00", 150000], ["10", 1000], [" ₹ 20.5 ", 2050],
      ["1,00,000", 10000000], ["₹0.05", 5], ["0", 0],
    ] as const)
      expect(parseMoney(raw)).toEqual({ ok: true, value: paise });
  });
  it("rejects malformed money instead of cleaning it up", () => {
    for (const raw of ["", "abc", "$10", "₹-5", "-5", "(5)", "1,23", "1,2345", "10.999", "1e3", "₹10 per box", "10..0", "1,500,", "NaN", "Infinity", "₹99999999999999999"])
      expect(parseMoney(raw).ok, raw).toBe(false);
  });
  it("parses percent into basis points within (0, 100]", () => {
    expect(parsePercent("10")).toEqual({ ok: true, value: 1000 });
    expect(parsePercent("12.5%")).toEqual({ ok: true, value: 1250 });
    expect(parsePercent("100")).toEqual({ ok: true, value: 10000 });
    for (const raw of ["0", "101", "-5", "5.555", "ten", ""]) expect(parsePercent(raw).ok, raw).toBe(false);
  });
  it("accepts only positive whole counts", () => {
    expect(parseCount("12")).toEqual({ ok: true, value: 12 });
    for (const raw of ["0", "1.5", "-1", "12 shots", ""]) expect(parseCount(raw).ok, raw).toBe(false);
  });
});

describe("real sheet shape", () => {
  const { snapshot, diagnostics } = parseSheet(readFileSync("tests/fixtures/real-shape.csv", "utf8"));
  it("reads products, offers and settings by header name", () => {
    expect(snapshot.products.length).toBeGreaterThan(40);
    expect(snapshot.products[0]).toMatchObject({ id: "PRD-0001", pricePaise: 1000, mrpPaise: 1400, inStock: true, visible: true });
    expect(snapshot.offers.map((o) => o.code)).toEqual(["CRACK10", "CRACK15", "CRACK20"]);
    expect(snapshot.offers.every((o) => !o.enabled)).toBe(true);
    expect(snapshot.settings).toEqual({ shopName: null, whatsapp: "919992230740" });
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
  it("splits multi-line image cells and keeps pieces and shots separate", () => {
    expect(snapshot.products[3].imageLinks).toHaveLength(2);
    const sky = snapshot.products.find((p) => p.id === "PRD-0046")!;
    expect(sky).toMatchObject({ shots: 100, piecesPerPack: null });
    expect(snapshot.products.find((p) => p.id === "PRD-0029")).toMatchObject({ piecesPerPack: 5, shots: null });
  });
  it("never copies Notes into the snapshot", () => {
    expect(JSON.stringify(snapshot)).not.toContain("Confirm pack contents");
    expect(JSON.stringify(snapshot)).not.toContain("confirm meaning");
  });
});

describe("section boundaries", () => {
  it("accepts blank rows between valid products and between offers", () => {
    const r = parse({
      products: [1, 2, 3, 4, 5].map((n) => product(n)),
      offers: [coupon({ code: "A" }), coupon({ name: "B", code: "B" }), coupon({ name: "C", code: "C" })],
      blankBetweenProducts: true,
      blankBetweenOffers: true,
    });
    expect(r.snapshot.products).toHaveLength(5);
    expect(r.snapshot.offers.map((o) => o.code)).toEqual(["A", "B", "C"]);
    expect(r.snapshot.settings.whatsapp).toBe("919876543210");
  });
  it("accepts a product inserted directly above the offers section (no spacer rows)", () => {
    const text = sheet({ products: [product(1)] }).replace(
      "\n\n\nCOUPONS & OFFERS",
      `\n${toCsv([Object.values(product(2)).slice(0, 0)]).trim()}PRD-0002,Inserted,Cat,₹5.00,,,TRUE,YES,,,,\nCOUPONS & OFFERS`,
    );
    const r = parseSheet(text);
    expect(r.snapshot.products.map((p) => p.id)).toEqual(["PRD-0001", "PRD-0002"]);
    expect(r.snapshot.settings.shopName).toBe("Test Shop");
  });
  it("finds the sections wherever they are when many rows are added or columns are reordered", () => {
    const many = Array.from({ length: 120 }, (_, i) => product(i + 1));
    const r = parse({
      products: many,
      productColumns: ["shots", "notes", "stock", "id", "show", "price", "name", "category", "images", "desc", "pieces", "mrp"],
      offers: [coupon()],
    });
    expect(r.snapshot.products).toHaveLength(120);
    expect(r.snapshot.products[119]).toMatchObject({ id: "PRD-0120", pricePaise: 10000, mrpPaise: 14000 });
    expect(r.snapshot.offers).toHaveLength(1);
  });
  it("tolerates header spelling, spacing and case differences", () => {
    const text = sheet().replace("Selling price (₹)", "  SELLING   PRICE ").replace("Show on website", "show ON Website");
    expect(parseSheet(text).snapshot.products).toHaveLength(2);
  });
  it("treats a single-cell sentence as a note but reports an incomplete row", () => {
    const r = parse({ extraRows: { afterProducts: [["Remember to confirm these prices soon."], ["", "Orphan name only"]] } });
    expect(r.snapshot.products).toHaveLength(2);
    const d = r.diagnostics.filter((x) => x.section === "products");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: "error", field: "Product ID" });
    expect(d[0].row).toBeGreaterThan(4);
  });
  it("rejects ambiguous structure: duplicate normalised headers, repeated sections", () => {
    const dupCol = sheet().replace("Short description", "stock");
    expect(fails(dupCol, "structure").message).toMatch(/Duplicate column/);
    const twice = sheet() + sheet({ products: [product(9)] });
    expect(fails(twice, "structure").message).toMatch(/more than once/);
    const oneHeaderRepeated = sheet().replace("SHOP SETTINGS", "SHOP SETTINGS\nSetting,Value,Meaning\n");
    expect(fails(oneHeaderRepeated, "structure").message).toMatch(/more than once/);
  });
  it("rejects a missing section or required header and names the header", () => {
    expect(fails(sheet({ noOffersMarker: true }), "structure").message).toMatch(/COUPONS & OFFERS/);
    expect(fails(sheet().replace("Selling price (₹)", "Price"), "structure").message).toMatch(/header/i);
    expect(fails(sheet().replace("Enabled", "Active"), "structure").message).toMatch(/enabled/);
  });
  it("rejects duplicate Product IDs (case-insensitive) with both row numbers", () => {
    const e = fails(sheet({ products: [product(1), product(2, { id: "prd-0001" })] }), "structure");
    expect(e.message).toMatch(/Duplicate Product ID/);
    expect(e.diagnostics.at(-1)).toMatchObject({ section: "products", field: "Product ID" });
  });
  it("does not merge products with the same name but different IDs", () => {
    const r = parse({ products: [product(1, { name: "POP-UP" }), product(2, { name: "POP-UP" })] });
    expect(r.snapshot.products.map((p) => p.id)).toEqual(["PRD-0001", "PRD-0002"]);
  });
});

describe("whole-response problems", () => {
  it("flags HTML or a sign-in page as an access problem", () => {
    fails("<!DOCTYPE html><html><head><title>Sign in</title></head></html>", "access");
    fails("  \n<html lang=en>…", "access");
  });
  it("flags an empty response", () => {
    fails("", "empty");
    fails("   \n ", "empty");
  });
  it("rejects arbitrary text that is not the sheet", () => {
    fails("hello,world\n1,2\n", "structure");
  });
});

describe("product fields", () => {
  const one = (p: P) => parse({ products: [product(1, p)] });
  it("reads Stock TRUE/FALSE case-insensitively; blank or junk is NOT available", () => {
    for (const [raw, expected] of [["TRUE", true], ["true", true], [" True ", true], ["FALSE", false], ["false", false], ["", false], ["yes", false], ["0", false]] as const)
      expect(one({ stock: raw }).snapshot.products[0].inStock, raw).toBe(expected);
    expect(one({ stock: "" }).diagnostics.some((d) => d.field === "Stock")).toBe(true);
    expect(one({ stock: "TRUE" }).diagnostics.some((d) => d.field === "Stock")).toBe(false);
  });
  it("shows only YES; NO, blank and junk hide the product", () => {
    for (const [raw, expected] of [["YES", true], ["yes", true], ["NO", false], ["", false], ["maybe", false]] as const)
      expect(one({ show: raw }).snapshot.products[0].visible, raw).toBe(expected);
  });
  it("keeps stock and visibility independent", () => {
    const p = one({ stock: "FALSE", show: "YES" }).snapshot.products[0];
    expect([p.inStock, p.visible]).toEqual([false, true]);
    const q = one({ stock: "TRUE", show: "NO" }).snapshot.products[0];
    expect([q.inStock, q.visible]).toEqual([true, false]);
  });
  it("never creates a free product from a bad or zero price", () => {
    for (const raw of ["", "free", "₹0.00", "0", "-10", "10 rupees"]) {
      const r = one({ price: raw });
      expect(r.snapshot.products[0].pricePaise, raw).toBeNull();
      expect(r.diagnostics.some((d) => d.field === "Selling price (₹)" && d.row !== null), raw).toBe(true);
    }
  });
  it("uses the selling price directly; invented MRPs are impossible, bad MRPs are dropped", () => {
    expect(one({ price: "₹10.00", mrp: "" }).snapshot.products[0]).toMatchObject({ pricePaise: 1000, mrpPaise: null });
    expect(one({ mrp: "abc" }).snapshot.products[0].mrpPaise).toBeNull();
    expect(one({ mrp: "₹140.00" }).snapshot.products[0].mrpPaise).toBe(14000);
  });
  it("accepts only positive whole numbers for pieces and shots, independently", () => {
    const p = one({ pieces: "5", shots: "100" }).snapshot.products[0];
    expect([p.piecesPerPack, p.shots]).toEqual([5, 100]);
    const q = one({ pieces: "0", shots: "1.5" }).snapshot.products[0];
    expect([q.piecesPerPack, q.shots]).toEqual([null, null]);
    const r = one({ pieces: "", shots: "12" }).snapshot.products[0];
    expect([r.piecesPerPack, r.shots]).toEqual([null, 12]);
  });
  it("keeps only safe https image links and de-duplicates them", () => {
    const p = one({
      images: "https://a.example/1.jpg\nhttp://insecure.example/2.jpg\njavascript:alert(1)\nhttps://u:p@evil.example/x.png\nhttps://a.example/1.jpg  https://b.example/3.webp",
    });
    expect(p.snapshot.products[0].imageLinks).toEqual(["https://a.example/1.jpg", "https://b.example/3.webp"]);
    expect(p.diagnostics.filter((d) => d.field === "Image links")).toHaveLength(3);
  });
  it("treats markup in text as plain text (it is only ever rendered as text)", () => {
    const p = one({ name: "<img src=x onerror=alert(1)>", desc: "<script>1</script>\n\nSecond   paragraph" }).snapshot.products[0];
    expect(p.name).toBe("<img src=x onerror=alert(1)>");
    expect(p.description).toBe("<script>1</script>\nSecond paragraph");
  });
  it("derives a case-folded category key and leaves a blank category blank", () => {
    expect(one({ category: "  Anar   Bomb " }).snapshot.products[0]).toMatchObject({ category: "Anar Bomb", categoryKey: "anar bomb" });
    expect(one({ category: "" }).snapshot.products[0].category).toBe("");
  });
  it("skips rows without an ID or name with a located diagnostic", () => {
    const r = parse({ products: [product(1), product(2, { id: "" }), product(3, { name: "" })] });
    expect(r.snapshot.products.map((p) => p.id)).toEqual(["PRD-0001"]);
    expect(r.diagnostics.map((d) => d.field)).toEqual(expect.arrayContaining(["Product ID", "Product name"]));
  });
});

describe("offers", () => {
  const offers = (list: O[]) => parse({ offers: list });
  it("reads coupon and automatic offers, with inclusive limits and blanks", () => {
    const r = offers([
      coupon({ min: "₹2,000.00", max: "₹5,000.00" }),
      { name: "Auto", mode: "automatic", type: "fixed", value: "₹100", enabled: "yes" },
    ]);
    expect(r.snapshot.offers[0]).toMatchObject({ mode: "coupon", code: "TEN", type: "percent", value: 1000, minPaise: 200000, maxPaise: 500000, enabled: true });
    expect(r.snapshot.offers[1]).toMatchObject({ mode: "automatic", code: null, type: "fixed", value: 10000, minPaise: null, maxPaise: null });
  });
  it("keeps disabled offers (so 'not active' can be explained) and never enables by guess", () => {
    expect(offers([coupon({ enabled: "NO" })]).snapshot.offers[0].enabled).toBe(false);
    expect(offers([coupon({ enabled: "" })]).snapshot.offers).toHaveLength(0);
  });
  it("drops invalid offers with a diagnostic and keeps the valid ones", () => {
    const bad: O[] = [
      coupon({ code: "P0", value: "0" }), coupon({ code: "P1", value: "101" }), coupon({ code: "F-", type: "Fixed", value: "-5" }),
      coupon({ code: "RNG", min: "₹500", max: "₹100" }), coupon({ code: "MODE", mode: "Both" }), coupon({ code: "TYPE", type: "Flat" }),
      coupon({ code: "LIM", min: "five hundred" }), coupon({ code: "", name: "No code" }), coupon({ code: "BAD CODE!" }),
    ];
    const r = offers([...bad, coupon({ code: "GOOD", name: "Good" })]);
    expect(r.snapshot.offers.map((o) => o.code)).toEqual(["GOOD"]);
    expect(r.diagnostics.filter((d) => d.section === "offers" && d.severity === "error")).toHaveLength(bad.length);
  });
  it("ignores obsolete columns and Notes", () => {
    const text = sheet({ offers: [coupon({ notes: "secret meaning" })] }).replace("Notes\n", "Notes,Max saving,Starts on,Below cart\n");
    expect(JSON.stringify(parseSheet(text).snapshot)).not.toContain("secret meaning");
  });
  it("drops every offer in a group of enabled coupons sharing a code (case-insensitive)", () => {
    const r = offers([coupon({ name: "A", code: "SAVE" }), coupon({ name: "B", code: "save" }), coupon({ name: "C", code: "OTHER" })]);
    expect(r.snapshot.offers.map((o) => o.code)).toEqual(["OTHER"]);
    expect(r.diagnostics.some((d) => /SAVE.*rows/.test(d.message))).toBe(true);
    // A disabled duplicate is not ambiguous.
    expect(offers([coupon({ name: "A", code: "SAVE" }), coupon({ name: "B", code: "save", enabled: "NO" })]).snapshot.offers).toHaveLength(2);
  });
});

describe("shop settings", () => {
  const settings = (s: [string, string][]) => parse({ settings: s }).snapshot.settings;
  it("normalises the WhatsApp number to digits", () => {
    expect(settings([["WhatsApp number", "+91 99922-30740"]]).whatsapp).toBe("919992230740");
    expect(settings([["whatsapp  NUMBER", "919992230740"]]).whatsapp).toBe("919992230740");
  });
  it("makes a missing or invalid number null with a diagnostic (no fallback number)", () => {
    for (const raw of ["", "12345", "abc", "0919992230740", "9992230740 ext 5"]) {
      const r = parse({ settings: [["WhatsApp number", raw]] });
      expect(r.snapshot.settings.whatsapp, raw).toBeNull();
      expect(r.diagnostics.some((d) => d.field === "WhatsApp number")).toBe(true);
    }
  });
  it("does not invent a shop name", () => {
    expect(settings([["Shop name", "  "]]).shopName).toBeNull();
    expect(settings([["Shop name", "  Lakshmi   Crackers "]]).shopName).toBe("Lakshmi Crackers");
  });
  it("rejects a duplicated setting", () => {
    fails(sheet({ settings: [["Shop name", "A"], ["Shop name", "B"]] }), "structure");
  });
});

describe("validateSnapshot (cache contract)", () => {
  const good = () => structuredClone(parse({ offers: [coupon()] }).snapshot);
  it("accepts a freshly parsed snapshot", () => {
    expect(validateSnapshot(JSON.parse(JSON.stringify(good())))).toBeTruthy();
  });
  it("rejects malformed data of every kind", () => {
    const mutate = (fn: (s: any) => void) => {
      const s: any = good();
      fn(s);
      expect(() => validateSnapshot(s)).toThrow();
    };
    expect(() => validateSnapshot(null)).toThrow();
    expect(() => validateSnapshot([])).toThrow();
    mutate((s) => (s.products[0].pricePaise = -1));
    mutate((s) => (s.products[0].pricePaise = 1.5));
    mutate((s) => (s.products[0].pricePaise = 0));
    mutate((s) => (s.products[0].inStock = "TRUE"));
    mutate((s) => (s.products[1].id = s.products[0].id));
    mutate((s) => (s.products[0].imageLinks = ["javascript:alert(1)"]));
    mutate((s) => (s.settings.whatsapp = "123"));
    mutate((s) => (s.offers[0].mode = "both"));
    mutate((s) => (s.offers[0].value = 10001 + 0 * 1) && (s.offers[0].type = "percent"));
    mutate((s) => ((s.offers[0].minPaise = 500), (s.offers[0].maxPaise = 100)));
    mutate((s) => delete s.settings);
  });
});
