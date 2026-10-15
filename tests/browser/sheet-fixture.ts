import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { sheet, product, type O, type P, type SheetOptions } from "../helpers/sheet";

export { product, sheet };
export type { O, P, SheetOptions };

export const SHEET_URL = "https://docs.google.com/spreadsheets/d/*/export**";

// Stands in for the Google Sheet. Tests change `body` (or make it fail/slow) between refreshes,
// exactly as an edit in the sheet would. Nothing here contacts Google.
export class FakeSheet {
  body: string;
  constructor(body = sheet()) {
    this.body = body;
  }
  status = 200;
  contentType = "text/csv; charset=utf-8";
  delayMs = 0;
  abort = false; // simulate a network failure
  requests = 0;
  async install(page: Page) {
    await page.route(SHEET_URL, async (route) => {
      this.requests++;
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      if (this.abort) return route.abort("failed");
      return route.fulfill({
        status: this.status,
        contentType: this.contentType,
        headers: { "access-control-allow-origin": "*" },
        body: this.body,
      });
    });
    return this;
  }
  set(options: SheetOptions) {
    this.body = sheet(options);
    return this;
  }
}

export const products = (n: number, over: (i: number) => P = () => ({})) =>
  Array.from({ length: n }, (_, i) => product(i + 1, over(i + 1)));

// Records what the page tried to open (WhatsApp links) instead of opening it.
export async function stubWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as any).__opened = [];
    window.open = (url?: string | URL) => {
      (window as any).__opened.push(String(url));
      return { opener: null } as any;
    };
  });
}
export const opened = (page: Page) => page.evaluate(() => (window as any).__opened as string[]);

// A copy of the real sheet's shape (tests/fixtures/real-shape.csv), optionally edited.
export function realShape(o: { enableCoupon?: boolean; outOfStock?: string[] } = {}) {
  let text = readFileSync("tests/fixtures/real-shape.csv", "utf8");
  if (o.enableCoupon) text = text.replace(",NO,10% off upto 2000", ",YES,10% off upto 2000");
  for (const id of o.outOfStock ?? [])
    text = text.replace(new RegExp(`^(${id},.*?),TRUE,YES,`, "m"), "$1,FALSE,YES,");
  return text;
}
