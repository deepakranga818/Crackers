import type { Business, Buyer } from "./model";
export const safeField = (s: string) =>
  s
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
export function normalizeMobile(s: string) {
  let n = s.replace(/[\s()+-]/g, "");
  if (n.startsWith("91") && n.length === 12) n = n.slice(2);
  return n;
}
export function validateBuyer(b: Buyer, c: Business) {
  const errors: Partial<Record<keyof Buyer, string>> = {};
  const name = safeField(b.name);
  if (
    name.length < 2 ||
    name.length > 100 ||
    !/[\p{L}]/u.test(name) ||
    !/^[\p{L}\p{M}\s.'’-]+$/u.test(name)
  )
    errors.name = "Enter a full name (2–100 characters).";
  if (!/^[6-9]\d{9}$/.test(normalizeMobile(b.mobile)))
    errors.mobile = "Enter a valid 10-digit Indian mobile number.";
  const method = c.fulfilment.find((f) => f.id === b.method && f.verified);
  if (!method) errors.method = "Choose a verified fulfilment method.";
  if (method?.type === "delivery") {
    for (const field of ["address", "locality", "city", "state"] as const)
      if (safeField(b[field]).length < 2 || b[field].length > 200)
        errors[field] = "Enter 2–200 characters.";
    if (!/^[1-9]\d{5}$/.test(b.pin)) errors.pin = "Enter a six-digit PIN.";
    else if (!method.servicePins.includes(b.pin))
      errors.pin = "This PIN is outside the verified service area.";
  }
  if (b.landmark.length > 200) errors.landmark = "Use 200 characters or fewer.";
  if (b.notes.length > 500) errors.notes = "Use 500 characters or fewer.";
  if (!b.acknowledged)
    errors.acknowledged = "Acknowledge sharing these details with the seller.";
  return errors;
}
