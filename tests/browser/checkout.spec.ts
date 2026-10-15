import { test, expect, type Page } from "@playwright/test";
import { FakeSheet, opened, product, products, sheet, stubWindowOpen, type O } from "./sheet-fixture";

// Mocked integration tests of cart, offers and WhatsApp checkout. window.open is stubbed: no
// WhatsApp link is ever opened, only recorded and inspected.
const TEN: O = { name: "Ten percent", mode: "Coupon", code: "TEN", type: "Percent", value: "10", enabled: "YES" };
const refresh = (page: Page) => page.getByRole("button", { name: "Refresh", exact: true }).click();
const cart = (page: Page) => page.getByRole("dialog");

async function add(page: Page, name: string) {
  await page.locator(".product-card").filter({ hasText: name }).getByRole("button", { name: "Add to cart" }).click();
}
async function openCart(page: Page) {
  await page.getByRole("button", { name: /Open cart/ }).click();
}
// A code only counts once Apply is pressed.
async function applyCoupon(page: Page, code: string) {
  await cart(page).getByLabel("Coupon code").fill(code);
  await cart(page).getByRole("button", { name: "Apply", exact: true }).click();
}
async function toForm(page: Page) {
  await openCart(page);
  await cart(page).getByRole("button", { name: "Proceed to buyer details" }).click();
}
async function fillForm(page: Page, over: { name?: string; mobile?: string } = {}) {
  await page.getByLabel("Full name *").fill(over.name ?? "Asha Rao");
  await page.getByLabel("Mobile number *").fill(over.mobile ?? "9876543210");
  await page.getByRole("checkbox").check();
}
const submit = (page: Page) => page.getByRole("button", { name: /Continue to WhatsApp|Open WhatsApp again/ });
async function setup(page: Page, options: Parameters<typeof sheet>[0] = {}) {
  await stubWindowOpen(page);
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,000.00", pieces: "5", shots: "12" }), product(2, { name: "Beta", price: "₹50.00" })], offers: [TEN], ...options });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(2);
  return fake;
}
const savedCart = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("diwali-cart-v2") ?? "null"));

test("the cart is saved by Product ID and quantity, restored after reload, and the old format is discarded", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("diwali-cart-v1", JSON.stringify({ schema: 1, items: { "dc-001": 2 } })));
  await setup(page);
  await add(page, "Alpha");
  await add(page, "Beta");
  const saved = await savedCart(page);
  expect(saved.items).toEqual({ "PRD-0001": 1, "PRD-0002": 1 });
  expect(await page.evaluate(() => localStorage.getItem("diwali-cart-v1"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Open cart, 2 units" })).toBeVisible();
});

test("coupons: applied with the Apply button, case-insensitive and trimmed; unknown and disabled codes are explained in a visible box and never saved", async ({ page }) => {
  await setup(page, { offers: [TEN, { ...TEN, name: "Off", code: "OFF", enabled: "NO" }] });
  await add(page, "Alpha");
  await openCart(page);
  await expect(cart(page).locator(".price-summary")).not.toContainText("Ten percent");
  // Typing alone applies nothing.
  await cart(page).getByLabel("Coupon code").fill("  ten ");
  await expect(cart(page).locator(".price-summary .offer-saving")).toHaveCount(0);
  await cart(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(cart(page).locator(".price-summary .offer-saving")).toContainText("−₹100");
  await expect(cart(page).locator(".price-summary")).toContainText("Ten percent (TEN)");
  await expect(cart(page).locator(".coupon-applied")).toContainText("TEN applied");
  await expect(cart(page).locator(".coupon-applied")).toContainText("you save ₹100");
  expect((await savedCart(page)).coupon).toBe("ten");
  // Remove brings the box back, empty, ready for another code.
  await cart(page).getByRole("button", { name: "Remove coupon" }).click();
  await expect(cart(page).locator(".price-summary .offer-saving")).toHaveCount(0);
  await expect(cart(page).getByLabel("Coupon code")).toHaveValue("");
  expect((await savedCart(page)).coupon).toBe("");
  await applyCoupon(page, "nope");
  const error = cart(page).locator("#coupon-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toContainText("Coupon not applied");
  await expect(error).toContainText("not valid");
  await expect(cart(page).locator(".price-summary .offer-saving")).toHaveCount(0);
  await applyCoupon(page, "off");
  await expect(error).toContainText("not active");
  await applyCoupon(page, "");
  await expect(error).toContainText("Enter a coupon code");
  expect((await savedCart(page)).coupon).toBe(""); // none of the failed attempts were saved
});

test("order limits are inclusive in the UI; an automatic offer needs no code and a better one wins with an explanation", async ({ page }) => {
  const ranged: O = { ...TEN, name: "Range", code: "RANGE", min: "₹1,000", max: "₹1,000", value: "5" };
  const auto: O = { name: "Festival 20", mode: "Automatic", type: "Percent", value: "20", min: "₹2,000", enabled: "YES" };
  await setup(page, { offers: [ranged, auto] });
  await add(page, "Alpha");
  await openCart(page);
  await applyCoupon(page, "range");
  await expect(cart(page).locator(".price-summary .offer-saving")).toContainText("−₹50"); // exactly at min and max
  await cart(page).getByRole("button", { name: "Increase Alpha PRD-0001 quantity" }).click(); // ₹2,000: coupon out of range, automatic in
  await expect(cart(page).locator(".coupon-applied.warn")).toContainText("up to ₹1,000");
  await expect(cart(page).locator(".price-summary")).toContainText("Festival 20");
  await expect(cart(page).locator(".price-summary .offer-saving")).toContainText("−₹400");
});

test("checkout re-fetches, builds the message from the sheet's numbers, opens only a wa.me link, and keeps the cart", async ({ page }) => {
  const fake = await setup(page, { settings: [["Shop name", "Lakshmi Crackers"], ["WhatsApp number", "+91 90000-11111"]] });
  await add(page, "Alpha");
  await add(page, "Beta");
  await toForm(page);
  await fillForm(page);
  const before = fake.requests;
  await submit(page).click();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  expect(fake.requests).toBe(before + 1); // a fresh fetch happened before the message was prepared
  const [url] = await opened(page);
  expect(opened(page)).resolves.toHaveLength(1);
  expect(url.startsWith("https://wa.me/919000011111?text=")).toBe(true);
  const message = new URL(url).searchParams.get("text")!;
  expect(message).toContain("Shop: Lakshmi Crackers");
  expect(message).toContain("1. *Alpha* (ID: PRD-0001) — Qty: 1 × ₹1,000 = ₹1,000");
  expect(message).toContain("5 pieces per pack · 12 shots");
  expect(message).toContain("2. *Beta* (ID: PRD-0002) — Qty: 1 × ₹50 = ₹50");
  expect(message).toContain("Subtotal: ₹1,050");
  expect(message).toContain("*Buyer:* Asha Rao");
  expect(message).not.toMatch(/internal note/);
  // Opening WhatsApp prepares a message; it never claims the order was sent, and the cart stays.
  await expect(page.locator("body")).not.toContainText(/order (sent|placed|confirmed)\b/i);
  expect((await savedCart(page)).items).toEqual({ "PRD-0001": 1, "PRD-0002": 1 });
});

test("the applied offer is carried into the message", async ({ page }) => {
  await setup(page);
  await add(page, "Alpha");
  await openCart(page);
  await applyCoupon(page, "TEN");
  await cart(page).getByRole("button", { name: "Proceed to buyer details" }).click();
  await fillForm(page);
  await submit(page).click();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  const message = new URL((await opened(page))[0]).searchParams.get("text")!;
  expect(message).toContain("Offer: Ten percent\nCoupon: TEN\nDiscount: −₹100");
  expect(message).toContain("₹900");
});

test("if the current data cannot be fetched, nothing is prepared and the cart and form are kept", async ({ page }) => {
  const fake = await setup(page);
  await add(page, "Alpha");
  await toForm(page);
  await fillForm(page, { name: "Priya Nair", mobile: "9123456780" });
  fake.abort = true;
  await submit(page).click();
  await expect(cart(page).getByRole("alert")).toContainText("couldn’t confirm the current prices");
  expect(await opened(page)).toEqual([]);
  await expect(page.getByLabel("Full name *")).toHaveValue("Priya Nair");
  await expect(page.getByLabel("Mobile number *")).toHaveValue("9123456780");
  await expect(page.getByRole("checkbox")).toBeChecked();
  expect((await savedCart(page)).items).toEqual({ "PRD-0001": 1 });
  // Same for a sign-in page and a rejected sheet.
  fake.abort = false;
  fake.body = "<html>Sign in</html>";
  fake.contentType = "text/html";
  await cart(page).getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(cart(page).getByRole("alert")).toContainText("couldn’t confirm");
  expect(await opened(page)).toEqual([]);
  // Retry succeeds once the sheet is readable again.
  fake.contentType = "text/csv";
  fake.body = sheet({ products: [product(1, { name: "Alpha", price: "₹1,000.00", pieces: "5", shots: "12" }), product(2, { name: "Beta", price: "₹50.00" })], offers: [TEN] });
  await cart(page).getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  expect(await opened(page)).toHaveLength(1);
});

test("a price that changed since review is shown first; nothing is sent until the customer accepts, and the sent total is the one reviewed", async ({ page }) => {
  const fake = await setup(page);
  await add(page, "Alpha");
  await toForm(page);
  await fillForm(page);
  await expect(cart(page).locator(".review-summary")).toContainText("₹1,000");
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,200.00", pieces: "5", shots: "12" }), product(2, { name: "Beta" })], offers: [TEN] });
  await submit(page).click();
  const panel = cart(page).locator(".callout.changes");
  await expect(panel).toContainText("Alpha: price changed from ₹1,000 to ₹1,200");
  await expect(panel).toContainText("Total changed from ₹1,000 to ₹1,200");
  expect(await opened(page)).toEqual([]);
  await expect(submit(page)).toBeDisabled();
  await panel.getByRole("button", { name: /review my updated order/ }).click();
  await expect(cart(page).locator(".review-summary")).toContainText("₹1,200");
  await submit(page).click();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  const message = new URL((await opened(page))[0]).searchParams.get("text")!;
  expect(message).toContain("× ₹1,200 = ₹1,200");
  expect(message).not.toContain("₹1,000");
});

test("a changed coupon is reviewed even when the total stays the same", async ({ page }) => {
  const fake = await setup(page, { offers: [TEN, { name: "Hundred off", mode: "Coupon", code: "HUNDRED", type: "Fixed", value: "100", enabled: "YES" }] });
  await add(page, "Alpha");
  await openCart(page);
  await applyCoupon(page, "TEN");
  await cart(page).getByRole("button", { name: "Proceed to buyer details" }).click();
  await fillForm(page);
  // The sheet swaps the offers: the same ₹100 saving, but a different offer.
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,000.00", pieces: "5", shots: "12" }), product(2, { name: "Beta", price: "₹50.00" })], offers: [{ ...TEN, name: "Ten renamed" }] });
  await submit(page).click();
  await expect(cart(page).locator(".callout.changes")).toContainText("Offer changed: Ten percent (TEN), −₹100 → Ten renamed (TEN), −₹100");
  expect(await opened(page)).toEqual([]);
});

test("a changed WhatsApp number triggers review and the new number is used only after acceptance", async ({ page }) => {
  const fake = await setup(page);
  await add(page, "Alpha");
  await toForm(page);
  await fillForm(page);
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,000.00", pieces: "5", shots: "12" }), product(2, { name: "Beta", price: "₹50.00" })], offers: [TEN], settings: [["Shop name", "X"], ["WhatsApp number", "919111111111"]] });
  await submit(page).click();
  await expect(cart(page).locator(".callout.changes")).toContainText("WhatsApp number your order goes to has changed");
  expect(await opened(page)).toEqual([]);
  await cart(page).getByRole("button", { name: /review my updated order/ }).click();
  await submit(page).click();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  expect((await opened(page))[0]).toContain("wa.me/919111111111");
});

test("an item that becomes out of stock, hidden or removed stays in the cart, flagged; checkout waits until it is removed", async ({ page }) => {
  const fake = await setup(page);
  await add(page, "Alpha");
  await add(page, "Beta");
  await openCart(page);
  await cart(page).getByRole("button", { name: "Close dialog" }).click();
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,000.00", stock: "FALSE" })], offers: [TEN] });
  await refresh(page);
  await openCart(page);
  await expect(cart(page).locator(".callout.changes")).toContainText("Alpha is now out of stock");
  await expect(cart(page).locator(".callout.changes")).toContainText("Beta is now no longer listed");
  await expect(cart(page).locator(".cart-line").filter({ hasText: "Alpha" })).toContainText("Out of stock");
  await expect(cart(page).locator(".cart-line").filter({ hasText: "Beta" })).toContainText("No longer available");
  await expect(cart(page).getByRole("button", { name: "Proceed to buyer details" })).toBeDisabled();
  expect((await savedCart(page)).items).toEqual({ "PRD-0001": 1, "PRD-0002": 1 }); // nothing silently discarded
  await cart(page).getByRole("button", { name: /OK, review/ }).click();
  await expect(cart(page).getByRole("button", { name: "Proceed to buyer details" })).toBeDisabled();
  await cart(page).getByRole("button", { name: /Remove Alpha/ }).click();
  await cart(page).getByRole("button", { name: /Remove Beta/ }).click();
  await expect(cart(page)).toContainText("Your cart is empty");
});

test("a background refresh that changes a price while the cart is open is announced, not silently applied", async ({ page }) => {
  await page.clock.install();
  const fake = await setup(page);
  await add(page, "Alpha");
  await openCart(page);
  fake.set({ products: [product(1, { name: "Alpha", price: "₹900.00" }), product(2, { name: "Beta" })], offers: [TEN] });
  await page.clock.fastForward(61_000);
  await expect(cart(page).locator(".callout.changes")).toContainText("Alpha: price changed from ₹1,000 to ₹900");
});

test("returning with a saved cart reports a price that changed while away", async ({ page }) => {
  const fake = await setup(page);
  await add(page, "Alpha");
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,500.00" }), product(2, { name: "Beta" })], offers: [TEN] });
  await page.unroute("https://docs.google.com/spreadsheets/d/*/export**");
  await fake.install(page);
  await page.reload();
  await openCart(page);
  await expect(cart(page).locator(".callout.changes")).toContainText("Alpha: price changed from ₹1,000 to ₹1,500");
});

test("a double click opens WhatsApp once", async ({ page }) => {
  const fake = await setup(page);
  fake.delayMs = 300;
  await add(page, "Alpha");
  await toForm(page);
  await fillForm(page);
  await submit(page).dblclick();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  await page.waitForTimeout(500);
  expect(await opened(page)).toHaveLength(1);
});

test("a missing or invalid WhatsApp number is a recoverable checkout error with no fallback number", async ({ page }) => {
  const fake = await setup(page, { settings: [["Shop name", "S"], ["WhatsApp number", ""]] });
  await add(page, "Alpha");
  await toForm(page);
  await fillForm(page);
  await submit(page).click();
  await expect(cart(page).getByRole("alert")).toContainText("WhatsApp number is missing or invalid");
  expect(await opened(page)).toEqual([]);
  await expect(page.getByLabel("Full name *")).toHaveValue("Asha Rao");
  expect((await savedCart(page)).items).toEqual({ "PRD-0001": 1 });
  // The footer shows no number either.
  expect(await page.locator("footer").innerText()).not.toMatch(/\+?91 ?\d{5}/);
  // Fixing the sheet is picked up by the next attempt without any reload.
  fake.set({ products: [product(1, { name: "Alpha", price: "₹1,000.00", pieces: "5", shots: "12" }), product(2, { name: "Beta", price: "₹50.00" })], offers: [TEN], settings: [["WhatsApp number", "919222222222"]] });
  await submit(page).click();
  await expect(cart(page).locator(".callout.changes")).toContainText("WhatsApp number");
  await cart(page).getByRole("button", { name: /review my updated order/ }).click();
  await submit(page).click();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  expect((await opened(page))[0]).toContain("wa.me/919222222222");
});

test("long orders ask for the full text to be copied or downloaded first", async ({ page }) => {
  await stubWindowOpen(page);
  const fake = await new FakeSheet().install(page);
  fake.set({ products: products(60, (i) => ({ name: `A moderately long product name number ${i}` })), offers: [] });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(60);
  for (let i = 1; i <= 60; i++) await page.locator(".product-card").nth(i - 1).getByRole("button", { name: "Add to cart" }).click();
  await toForm(page);
  await fillForm(page);
  await submit(page).click();
  await expect(cart(page).getByText("Copy your full order first")).toBeVisible();
  expect(await opened(page)).toEqual([]);
  await expect(cart(page).getByText(/Prices fetched/)).toHaveCount(0);
});
