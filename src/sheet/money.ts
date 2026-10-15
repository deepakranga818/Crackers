// Strict parsing of sheet money and percent cells. Nothing is "cleaned up" until it looks like a
// number: anything that is not a plain amount is rejected with a reason.

// ₹10,00,00,000 (ten crore). Far beyond any real price, far below the safe-integer limit.
export const MAX_PAISE = 100_000_000_000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

// Accepts: 10, 10.5, 10.50, ₹10, ₹ 1,500.00, 1,00,000 (lakh grouping), surrounding spaces.
// Rejects: negatives, other currencies, text, exponent, more than two decimals, bad grouping.
const MONEY =
  /^₹?\s*(\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3}|\d+)(?:\.(\d{1,2}))?$/;

export function parseMoney(raw: string): Parsed<number> {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "blank" };
  if (/^[-−(]/.test(s)) return { ok: false, reason: "negative amounts are not allowed" };
  const m = MONEY.exec(s);
  if (!m) return { ok: false, reason: `"${s.slice(0, 30)}" is not a valid amount` };
  const rupees = Number(m[1].replace(/,/g, ""));
  const paise = rupees * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  if (!Number.isSafeInteger(paise) || paise > MAX_PAISE)
    return { ok: false, reason: "amount is too large" };
  return { ok: true, value: paise };
}

// Percent cells: 10, 12.5, 7.25, optionally followed by %. Up to two decimals (basis points),
// greater than 0 and at most 100. Returned in basis points (10 → 1000).
export function parsePercent(raw: string): Parsed<number> {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "blank" };
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?\s*%?$/.exec(s);
  if (!m) return { ok: false, reason: `"${s.slice(0, 30)}" is not a valid percentage` };
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  if (bp <= 0 || bp > 10000)
    return { ok: false, reason: "percentage must be above 0 and at most 100" };
  return { ok: true, value: bp };
}

// Whole positive count (pieces, shots).
export function parseCount(raw: string): Parsed<number> {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "blank" };
  if (!/^\d{1,7}$/.test(s)) return { ok: false, reason: `"${s.slice(0, 30)}" is not a whole number` };
  const n = Number(s);
  return n > 0 ? { ok: true, value: n } : { ok: false, reason: "must be above 0" };
}

export const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
