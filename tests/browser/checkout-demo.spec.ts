import { test, expect, type Page } from "@playwright/test";
import { FakeSheet, product, products, stubWindowOpen, opened } from "./sheet-fixture";

// Smoke checks for the local checkout demo (`npm run demo`, port 5180): dev-only, dry run,
// sample fulfilment methods (including delivery with PIN checks). It reads the same sheet as the
// real site (here a fixture) and must never reach WhatsApp.
const DEMO = "http://127.0.0.1:5180";

async function watchWhatsApp(page: Page) {
  const hits: string[] = [];
  await stubWindowOpen(page);
  await page.route(/wa\.me|whatsapp\.com/, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  page.on("popup", (popup) => hits.push(`popup ${popup.url()}`));
  return hits;
}

test("the demo is labelled, delivery needs a serviceable PIN, and a full checkout is a dry run", async ({ page }) => {
  const hits = await watchWhatsApp(page);
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,000.00" })], settings: [["Shop name", "Demo Shop"], ["WhatsApp number", "919876500000"]] });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(DEMO);
  await expect(page.locator(".demo-label")).toHaveText("Local checkout demo — test data");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("button", { name: /Open cart/ }).click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Test Buyer");
  await page.getByLabel("Mobile number *").fill("9876543210");
  await page.getByLabel("Fulfilment method *").selectOption({ label: "Sample delivery, ₹50 charge (test data)" });
  await page.getByLabel("Address line *").fill("1 Sample Street");
  await page.getByLabel("Locality / area *").fill("Sample Area");
  await page.getByLabel("City *").fill("Sample City");
  await page.getByLabel("State *").fill("Sample State");
  await page.getByLabel("PIN code *").fill("999999");
  await page.getByRole("checkbox").check();
  const go = page.getByRole("button", { name: "Continue to WhatsApp", exact: true });
  await go.click();
  await expect(page.getByText(/outside the verified service area/)).toBeVisible();
  await page.getByLabel("PIN code *").fill("110001");
  await expect(page.locator(".review-summary")).toContainText("₹50");
  await go.click();
  const panel = page.locator(".dry-run");
  await expect(panel).toContainText("nothing was sent");
  await expect(panel).toContainText("+919876500000");
  await expect(panel.locator("code")).toContainText("https://wa.me/919876500000?text=");
  await expect(panel).toContainText("*Fulfilment:* Delivery");
  expect(await opened(page)).toEqual([]);
  expect(hits).toEqual([]);
});

test("the demo uses the sheet's data: stock, visibility and pieces come through unchanged", async ({ page }) => {
  await watchWhatsApp(page);
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [...products(2), product(3, { name: "Out", stock: "FALSE" }), product(4, { name: "Hidden", show: "NO" })] });
  await page.goto(DEMO);
  await expect(page.locator(".product-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(2);
});
