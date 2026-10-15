import { test, expect, type Response } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseSheet } from "../../src/sheet/parse";

// REAL Google Sheet, real Chromium, no route mocks (`npm run test:live`). It proves that the
// browser itself, from a web origin, can fetch the sheet across origins (including Google's
// redirect to googleusercontent.com), and that what the page shows matches what the sheet holds.
// It deliberately asserts no fixed product count: the sheet is the business's data and changes.
test("the browser reads the live sheet cross-origin and renders its visible products", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  const requests: string[] = [];
  page.on("request", (r) => /docs\.google\.com|googleusercontent\.com/.test(r.url()) && requests.push(r.url()));

  // Google answers the export URL with a 307 to googleusercontent.com, which returns the CSV.
  // Both hops must allow this origin, or the browser blocks the read.
  const redirect = page.waitForResponse((r: Response) => /docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/.test(r.url()));
  const csv = page.waitForResponse((r: Response) => /googleusercontent\.com\/export/.test(r.url()));
  await page.goto("/");
  const hop = await redirect;
  expect(hop.status()).toBe(307);
  expect(await hop.headerValue("access-control-allow-origin")).toBeTruthy();
  const res = await csv;
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.headerValue("access-control-allow-origin")).toBeTruthy();

  // The page's own fetch must have succeeded: an actual product list, not an error state.
  await expect(page.locator(".product-card").first()).toBeVisible({ timeout: 30_000 });

  // Parse the same sheet independently (from Node) and compare with what the page rendered.
  const { spreadsheetId } = JSON.parse(readFileSync("sheet.config.json", "utf8"));
  const text = await (await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`)).text();
  const { snapshot } = parseSheet(text);
  const visible = snapshot.products.filter((p) => p.visible);
  await expect(page.locator(".product-card")).toHaveCount(visible.length);
  const names = await page.locator(".product-card h3").allTextContents();
  expect(names).toEqual(visible.map((p) => p.name));

  // Stock flags from the sheet decide who can be added to the cart.
  const inStock = visible.filter((p) => p.inStock && p.pricePaise !== null).length;
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(inStock);
  await expect(page.locator(".product-card").filter({ hasText: "Out of stock" })).toHaveCount(visible.filter((p) => !p.inStock).length);

  // Nothing internal leaks into the page.
  const body = await page.locator("body").innerText();
  for (const p of snapshot.products) expect(body).not.toContain("Confirm pack contents and MRP.");
  expect(requests.length).toBeGreaterThan(0);
  expect(consoleErrors.filter((e) => /CORS|Access-Control|blocked by/i.test(e))).toEqual([]);
  test.info().annotations.push({
    type: "observed",
    description: `endpoint=${new URL(res.url()).host}; products rendered=${visible.length}; fetched requests=${requests.length}`,
  });
});
