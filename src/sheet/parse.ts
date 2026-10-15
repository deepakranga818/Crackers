import type { Offer, Product, Settings, Snapshot } from "../model";
import { parseCsvRows, type CsvRow } from "./csv";
import { MAX_PAISE, parseCount, parseMoney, parsePercent } from "./money";

export type Diagnostic = {
  severity: "error" | "warning";
  section: "sheet" | "products" | "offers" | "settings";
  row: number | null; // spreadsheet row number
  field: string | null;
  message: string;
};
export type SheetErrorKind =
  | "access" // sign-in page / HTML / permission problem
  | "structure" // the sheet does not have the expected, unambiguous layout
  | "empty"
  | "network"
  | "timeout";
export class SheetError extends Error {
  constructor(
    public kind: SheetErrorKind,
    message: string,
    public diagnostics: Diagnostic[] = [],
  ) {
    super(message);
    this.name = "SheetError";
  }
}

const MAX_TEXT = 2_000_000;
const MAX_PRODUCTS = 5000;

// "Selling price (₹)" -> "sellingprice": case, spacing, punctuation and ₹ are irrelevant.
const norm = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const clean = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// Description keeps line breaks between paragraphs but not control characters.
const cleanParagraphs = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

type Section = "products" | "offers" | "settings";
const PRODUCT_REQUIRED = {
  id: "productid",
  name: "productname",
  category: "category",
  price: "sellingprice",
  stock: "stock",
  show: "showonwebsite",
} as const;
const PRODUCT_OPTIONAL = {
  mrp: "mrp",
  pieces: "piecesperpack",
  description: "shortdescription",
  images: "imagelinks",
  shots: "shots",
} as const;
const OFFER_REQUIRED = {
  name: "offername",
  mode: "mode",
  code: "couponcode",
  type: "discounttype",
  value: "discountvalue",
  min: "minimumorder",
  max: "maximumorder",
  enabled: "enabled",
} as const;
const SETTING_REQUIRED = { key: "setting", value: "value" } as const;

function fnv(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
export const snapshotVersion = (s: Omit<Snapshot, "version">) =>
  fnv(JSON.stringify([s.products, s.offers, s.settings]));

export function looksLikeHtml(text: string) {
  return /^\s*(<!doctype html|<html|<head|<body|<\?xml)/i.test(text.slice(0, 400));
}

const isBlank = (r: CsvRow) => r.cells.every((c) => !c.trim());
const filled = (r: CsvRow) => r.cells.filter((c) => c.trim()).length;
const hasKey = (r: CsvRow, ...keys: string[]) => {
  const n = new Set(r.cells.map(norm));
  return keys.every((k) => n.has(k));
};
const isMarker = (r: CsvRow, key: string) => filled(r) === 1 && norm(r.cells.find((c) => c.trim())!) === key;
// An explanatory line: one filled cell in column A that reads like a sentence.
const isNote = (r: CsvRow) =>
  filled(r) === 1 && !!r.cells[0]?.trim() && r.cells[0].trim().split(/\s+/).length >= 3;

function columns<K extends string>(
  header: CsvRow,
  required: Record<K, string>,
  optional: Record<string, string>,
  section: Diagnostic["section"],
  diag: Diagnostic[],
) {
  const index = new Map<string, number>();
  header.cells.forEach((c, i) => {
    const k = norm(c);
    if (!k) return;
    if (index.has(k))
      throw new SheetError("structure", `Duplicate column "${c.trim()}" in ${section}`, [
        ...diag,
        { severity: "error", section, row: header.line, field: c.trim(), message: "Two columns have the same name after normalisation." },
      ]);
    index.set(k, i);
  });
  const missing = Object.values(required).filter((k) => !index.has(k as string));
  if (missing.length)
    throw new SheetError("structure", `Missing column(s) in ${section}: ${missing.join(", ")}`, [
      ...diag,
      { severity: "error", section, row: header.line, field: missing.join(", "), message: "Required column header not found." },
    ]);
  const pos = {} as Record<K | keyof typeof optional, number>;
  for (const [name, key] of Object.entries(required) as [K, string][]) pos[name] = index.get(key)!;
  for (const [name, key] of Object.entries(optional)) (pos as Record<string, number>)[name] = index.get(key) ?? -1;
  return pos;
}

const cell = (r: CsvRow, i: number) => (i >= 0 ? (r.cells[i] ?? "") : "");

export function safeImageUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Turns a Google Sheets CSV export into one validated snapshot. Throws SheetError for anything
 * that makes the whole response untrustworthy (see README "Which errors reject the snapshot").
 * Row-level problems are reported in `diagnostics` and leave the rest of the sheet usable.
 */
export function parseSheet(text: string): { snapshot: Snapshot; diagnostics: Diagnostic[] } {
  const diag: Diagnostic[] = [];
  if (!text.trim()) throw new SheetError("empty", "The sheet response was empty.");
  if (looksLikeHtml(text))
    throw new SheetError("access", "Received a web page instead of sheet data (sign-in or permission page).");
  if (text.length > MAX_TEXT) throw new SheetError("structure", "The sheet response is unexpectedly large.");
  const rows = parseCsvRows(text);

  // ---- 1. Locate sections by content, never by row number ----
  const at = {
    productHeader: [] as number[],
    offersMarker: [] as number[],
    offersHeader: [] as number[],
    settingsMarker: [] as number[],
    settingsHeader: [] as number[],
  };
  rows.forEach((r, i) => {
    if (hasKey(r, PRODUCT_REQUIRED.id, PRODUCT_REQUIRED.price)) at.productHeader.push(i);
    else if (isMarker(r, "couponsoffers")) at.offersMarker.push(i);
    else if (hasKey(r, OFFER_REQUIRED.name, OFFER_REQUIRED.mode)) at.offersHeader.push(i);
    else if (isMarker(r, "shopsettings")) at.settingsMarker.push(i);
    else if (hasKey(r, SETTING_REQUIRED.key, SETTING_REQUIRED.value) && filled(r) <= 4) at.settingsHeader.push(i);
  });
  const structural = (message: string, row: CsvRow | null) =>
    new SheetError("structure", message, [
      { severity: "error", section: "sheet", row: row?.line ?? null, field: null, message },
    ]);
  const one = (list: number[], label: string, what: string) => {
    if (list.length === 0) throw structural(`Missing ${label}.`, null);
    if (list.length > 1) throw structural(`${what} appears more than once (rows ${list.map((i) => rows[i].line).join(", ")}).`, rows[list[1]]);
    return list[0];
  };
  if (at.productHeader.length === 0)
    throw structural("The products header row (Product ID, Selling price …) was not found.", null);
  const pH = one(at.productHeader, "products header", "The products header");
  const oM = one(at.offersMarker, "COUPONS & OFFERS section", "The COUPONS & OFFERS marker");
  const oH = one(at.offersHeader, "offers header row", "The offers header");
  const sM = one(at.settingsMarker, "SHOP SETTINGS section", "The SHOP SETTINGS marker");
  const sH = one(at.settingsHeader, "settings header row", "The settings header");
  if (oH < oM) throw structural("The offers header must come after the COUPONS & OFFERS marker.", rows[oH]);
  if (sH < sM) throw structural("The settings header must come after the SHOP SETTINGS marker.", rows[sH]);
  if (pH > Math.min(oM, sM)) throw structural("Products must be listed above COUPONS & OFFERS and SHOP SETTINGS.", rows[pH]);

  // A section runs until the next recognised marker/header or the end of the sheet. Blank rows
  // inside it are normal and ignored.
  const boundaries = [pH, oM, oH, sM, sH].sort((a, b) => a - b);
  const sectionRows = (header: number) => {
    const next = boundaries.find((b) => b > header) ?? rows.length;
    return rows.slice(header + 1, next);
  };
  // Anything between a marker and its header must be blank or an explanatory note.
  const checkGap = (marker: number, header: number, section: Section) => {
    for (const r of rows.slice(marker + 1, header))
      if (!isBlank(r) && !isNote(r))
        diag.push({ severity: "warning", section, row: r.line, field: null, message: "Unexpected content between the section title and its header; ignored." });
  };
  checkGap(oM, oH, "offers");
  checkGap(sM, sH, "settings");

  // ---- 2. Products ----
  const pc = columns(rows[pH], PRODUCT_REQUIRED, PRODUCT_OPTIONAL, "products", diag);
  const products: Product[] = [];
  const seenIds = new Map<string, number>();
  for (const r of sectionRows(pH)) {
    if (isBlank(r) || isNote(r)) continue;
    const id = clean(cell(r, pc.id));
    const warn = (field: string, message: string) =>
      diag.push({ severity: "warning", section: "products", row: r.line, field, message });
    if (!id) {
      diag.push({ severity: "error", section: "products", row: r.line, field: "Product ID", message: "Row has content but no Product ID; it was skipped." });
      continue;
    }
    if (id.length > 64) {
      diag.push({ severity: "error", section: "products", row: r.line, field: "Product ID", message: "Product ID is longer than 64 characters; row skipped." });
      continue;
    }
    const dupKey = id.toLowerCase();
    if (seenIds.has(dupKey))
      throw new SheetError("structure", `Duplicate Product ID "${id}" (rows ${seenIds.get(dupKey)} and ${r.line}).`, [
        ...diag,
        { severity: "error", section: "products", row: r.line, field: "Product ID", message: `Duplicate of row ${seenIds.get(dupKey)}. Product IDs must be unique.` },
      ]);
    seenIds.set(dupKey, r.line);
    const name = clean(cell(r, pc.name));
    if (!name) {
      diag.push({ severity: "error", section: "products", row: r.line, field: "Product name", message: `${id}: no product name; row skipped.` });
      continue;
    }
    const category = clean(cell(r, pc.category));
    const priceRaw = cell(r, pc.price);
    const price = parseMoney(priceRaw);
    let pricePaise: number | null = null;
    if (!price.ok) warn("Selling price (₹)", `${id}: ${price.reason}; shown as unavailable.`);
    else if (price.value <= 0) warn("Selling price (₹)", `${id}: price must be above zero; shown as unavailable.`);
    else pricePaise = price.value;
    let mrpPaise: number | null = null;
    if (cell(r, pc.mrp).trim()) {
      const mrp = parseMoney(cell(r, pc.mrp));
      if (mrp.ok && mrp.value > 0) mrpPaise = mrp.value;
      else warn("MRP (₹)", `${id}: ${mrp.ok ? "MRP must be above zero" : mrp.reason}; MRP ignored.`);
    }
    const count = (i: number, field: string) => {
      if (!cell(r, i).trim()) return null;
      const n = parseCount(cell(r, i));
      if (n.ok) return n.value;
      warn(field, `${id}: ${n.reason}; ignored.`);
      return null;
    };
    const stockRaw = cell(r, pc.stock).trim().toUpperCase();
    const inStock = stockRaw === "TRUE";
    if (stockRaw !== "TRUE" && stockRaw !== "FALSE")
      warn("Stock", `${id}: stock must be TRUE or FALSE (found "${stockRaw.slice(0, 20)}"); treated as out of stock.`);
    const showRaw = cell(r, pc.show).trim().toUpperCase();
    const visible = showRaw === "YES";
    if (showRaw !== "YES" && showRaw !== "NO")
      warn("Show on website", `${id}: must be YES or NO (found "${showRaw.slice(0, 20)}"); product hidden.`);
    const imageLinks: string[] = [];
    for (const part of cell(r, pc.images).split(/\s+/).filter(Boolean)) {
      const safe = safeImageUrl(part);
      if (!safe) warn("Image links", `${id}: ignored unsupported link "${part.slice(0, 40)}" (only https links are used).`);
      else if (!imageLinks.includes(safe)) imageLinks.push(safe);
    }
    const description = cleanParagraphs(cell(r, pc.description)).slice(0, 1000);
    products.push({
      id,
      name,
      category,
      categoryKey: category.toLocaleLowerCase(),
      pricePaise,
      mrpPaise,
      piecesPerPack: count(pc.pieces, "Pieces per pack"),
      shots: count(pc.shots, "Shots"),
      inStock,
      visible,
      description: description || null,
      imageLinks,
      displayOrder: products.length,
    });
    if (products.length > MAX_PRODUCTS) throw structural("The sheet has more products than this site supports.", r);
  }

  // ---- 3. Offers ----
  const oc = columns(rows[oH], OFFER_REQUIRED, {}, "offers", diag);
  const offers: Offer[] = [];
  for (const r of sectionRows(oH)) {
    if (isBlank(r) || isNote(r)) continue;
    const name = clean(cell(r, oc.name));
    const drop = (field: string, message: string) =>
      diag.push({ severity: "error", section: "offers", row: r.line, field, message: `${name || "(unnamed)"}: ${message} Offer ignored.` });
    if (!name) {
      diag.push({ severity: "error", section: "offers", row: r.line, field: "Offer name", message: "Row has content but no Offer name; ignored." });
      continue;
    }
    const mode = cell(r, oc.mode).trim().toLowerCase();
    if (mode !== "coupon" && mode !== "automatic") { drop("Mode", `Mode must be Coupon or Automatic (found "${mode.slice(0, 20)}").`); continue; }
    const enabledRaw = cell(r, oc.enabled).trim().toUpperCase();
    if (enabledRaw !== "YES" && enabledRaw !== "NO") { drop("Enabled", "Enabled must be YES or NO."); continue; }
    const codeRaw = clean(cell(r, oc.code));
    let code: string | null = null;
    if (mode === "coupon") {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(codeRaw)) { drop("Coupon code", "A coupon needs a code of letters, digits, - or _ (max 32)."); continue; }
      code = codeRaw;
    } else if (codeRaw)
      diag.push({ severity: "warning", section: "offers", row: r.line, field: "Coupon code", message: `${name}: Automatic offers need no code; the code is ignored.` });
    const type = cell(r, oc.type).trim().toLowerCase();
    if (type !== "percent" && type !== "fixed") { drop("Discount type", "Discount type must be Percent or Fixed."); continue; }
    const v = type === "percent" ? parsePercent(cell(r, oc.value)) : parseMoney(cell(r, oc.value));
    if (!v.ok || (type === "fixed" && v.value <= 0)) { drop("Discount value", v.ok ? "Discount must be above zero." : `${v.reason}.`); continue; }
    const limit = (i: number, field: string) => {
      if (!cell(r, i).trim()) return { ok: true as const, value: null };
      const m = parseMoney(cell(r, i));
      return m.ok ? { ok: true as const, value: m.value } : { ok: false as const, reason: m.reason, field };
    };
    const min = limit(oc.min, "Minimum order (₹)");
    if (!min.ok) { drop(min.field, `${min.reason}.`); continue; }
    const max = limit(oc.max, "Maximum order (₹)");
    if (!max.ok) { drop(max.field, `${max.reason}.`); continue; }
    if (min.value !== null && max.value !== null && max.value < min.value) {
      drop("Maximum order (₹)", "Maximum order is lower than the minimum order.");
      continue;
    }
    offers.push({
      name,
      mode,
      code,
      type,
      value: v.value,
      minPaise: min.value,
      maxPaise: max.value,
      enabled: enabledRaw === "YES",
      row: r.line,
    });
  }
  // Two enabled coupons with the same code are ambiguous: neither is trusted.
  const byCode = new Map<string, Offer[]>();
  for (const o of offers)
    if (o.mode === "coupon" && o.enabled) byCode.set(o.code!.toUpperCase(), [...(byCode.get(o.code!.toUpperCase()) ?? []), o]);
  const ambiguous = new Set<Offer>();
  for (const [code, list] of byCode)
    if (list.length > 1) {
      list.forEach((o) => ambiguous.add(o));
      diag.push({ severity: "error", section: "offers", row: list[1].row, field: "Coupon code", message: `Coupon code ${code} is enabled on rows ${list.map((o) => o.row).join(", ")}; those offers were ignored.` });
    }
  const finalOffers = offers.filter((o) => !ambiguous.has(o));

  // ---- 4. Settings ----
  const sc = columns(rows[sH], SETTING_REQUIRED, {}, "settings", diag);
  const found = new Map<string, string>();
  for (const r of sectionRows(sH)) {
    if (isBlank(r) || isNote(r)) continue;
    const key = norm(cell(r, sc.key));
    if (!key) {
      diag.push({ severity: "warning", section: "settings", row: r.line, field: "Setting", message: "Row has a value but no setting name; ignored." });
      continue;
    }
    if ((key === "shopname" || key === "whatsappnumber") && found.has(key))
      throw new SheetError("structure", `The setting "${cell(r, sc.key).trim()}" appears more than once.`, [
        ...diag,
        { severity: "error", section: "settings", row: r.line, field: "Setting", message: "Duplicate setting; remove one." },
      ]);
    found.set(key, cell(r, sc.value));
  }
  const settings: Settings = { shopName: null, whatsapp: null };
  const shop = clean(found.get("shopname") ?? "").slice(0, 80);
  settings.shopName = shop || null;
  const wa = (found.get("whatsappnumber") ?? "").trim();
  if (wa) {
    const digits = wa.replace(/[\s()+-]/g, "");
    if (/^[1-9]\d{10,14}$/.test(digits)) settings.whatsapp = digits;
    else diag.push({ severity: "error", section: "settings", row: null, field: "WhatsApp number", message: "WhatsApp number must be a country code plus number, digits only (11–15 digits)." });
  } else diag.push({ severity: "warning", section: "settings", row: null, field: "WhatsApp number", message: "WhatsApp number is blank; ordering is unavailable until it is set." });

  const body = { products, offers: finalOffers, settings };
  return { snapshot: { version: snapshotVersion(body), ...body }, diagnostics: diag };
}

// ---- Cache validation: the same contract as a fresh fetch ----
const isInt = (n: unknown, min = 0, max = MAX_PAISE): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
const isStr = (s: unknown, max = 2000): s is string => typeof s === "string" && s.length <= max;
const obj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o);

/** Throws if `value` is not a well-formed Snapshot. Used for anything read back from storage. */
export function validateSnapshot(value: unknown): Snapshot {
  const bad = (m: string): never => {
    throw new SheetError("structure", `Invalid saved data: ${m}`);
  };
  if (!obj(value)) return bad("not an object");
  const { products, offers, settings, version } = value;
  if (!isStr(version, 32)) bad("version");
  if (!Array.isArray(products) || products.length > MAX_PRODUCTS) bad("products");
  if (!Array.isArray(offers) || offers.length > 500) bad("offers");
  if (!obj(settings)) bad("settings");
  const ids = new Set<string>();
  for (const p of products as unknown[]) {
    if (!obj(p)) return bad("product");
    if (!isStr(p.id, 64) || !p.id) bad("product id");
    if (ids.has((p.id as string).toLowerCase())) bad(`duplicate product id ${p.id}`);
    ids.add((p.id as string).toLowerCase());
    if (!isStr(p.name, 300) || !p.name) bad("product name");
    if (!isStr(p.category, 300) || !isStr(p.categoryKey, 300)) bad("category");
    if (p.pricePaise !== null && !isInt(p.pricePaise, 1)) bad("price");
    if (p.mrpPaise !== null && !isInt(p.mrpPaise, 1)) bad("mrp");
    if (p.piecesPerPack !== null && !isInt(p.piecesPerPack, 1, 9_999_999)) bad("pieces");
    if (p.shots !== null && !isInt(p.shots, 1, 9_999_999)) bad("shots");
    if (typeof p.inStock !== "boolean" || typeof p.visible !== "boolean") bad("flags");
    if (p.description !== null && !isStr(p.description, 1000)) bad("description");
    if (!Array.isArray(p.imageLinks) || !p.imageLinks.every((l) => isStr(l, 2000) && safeImageUrl(l))) bad("images");
    if (!isInt(p.displayOrder, 0, MAX_PRODUCTS)) bad("order");
  }
  for (const o of offers as unknown[]) {
    if (!obj(o)) return bad("offer");
    if (!isStr(o.name, 300) || !o.name) bad("offer name");
    if (o.mode !== "coupon" && o.mode !== "automatic") bad("offer mode");
    if (o.mode === "coupon" ? !isStr(o.code, 32) || !o.code : o.code !== null) bad("offer code");
    if (o.type !== "percent" && o.type !== "fixed") bad("offer type");
    if (!isInt(o.value, 1, o.type === "percent" ? 10000 : MAX_PAISE)) bad("offer value");
    if (o.minPaise !== null && !isInt(o.minPaise)) bad("offer min");
    if (o.maxPaise !== null && !isInt(o.maxPaise)) bad("offer max");
    if (o.minPaise !== null && o.maxPaise !== null && (o.maxPaise as number) < (o.minPaise as number)) bad("offer range");
    if (typeof o.enabled !== "boolean" || !isInt(o.row, 0, 1_000_000)) bad("offer flags");
  }
  const s = settings as Record<string, unknown>;
  if (s.shopName !== null && !isStr(s.shopName, 80)) bad("shop name");
  if (s.whatsapp !== null && !(isStr(s.whatsapp, 15) && /^[1-9]\d{10,14}$/.test(s.whatsapp))) bad("whatsapp");
  return value as unknown as Snapshot;
}
