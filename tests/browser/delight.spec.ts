import { test, expect, type Page } from "@playwright/test";
import { FakeSheet, product, stubWindowOpen, type O } from "./sheet-fixture";

// The coupon list in the cart and the fireworks burst. window.open is stubbed: no WhatsApp link
// is ever opened.
const TEN: O = { name: "Ten percent", mode: "Coupon", code: "TEN", type: "Percent", value: "10", enabled: "YES" };
const OFF: O = { name: "Switched off", mode: "Coupon", code: "OFF", type: "Percent", value: "5", enabled: "NO" };
const AUTO: O = { name: "Festival", mode: "Automatic", type: "Percent", value: "20", min: "₹2,000", enabled: "YES" };
const cart = (page: Page) => page.getByRole("dialog");
const burst = (page: Page) => page.locator(".burst-layer");
const isOpen = (page: Page) => burst(page).evaluate((el) => el.matches(":popover-open"));

async function setup(page: Page) {
  await stubWindowOpen(page);
  const fake = await new FakeSheet().install(page);
  fake.set({
    products: [product(1, { name: "Alpha", price: "₹1,000.00" }), product(2, { name: "Beta", price: "₹50.00" })],
    offers: [TEN, OFF, AUTO],
  });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(2);
}
const add = (page: Page, name = "Alpha") =>
  page.locator(".product-card").filter({ hasText: name }).getByRole("button", { name: "Add to cart" }).click();

test("the offers strip says View offers, and the cart lists the coupon codes next to the box", async ({ page }) => {
  await setup(page);
  await expect(page.getByText("View terms")).toHaveCount(0);
  await page.getByText("View offers").click();
  await expect(page.locator(".offers")).toContainText("TEN");
  await add(page);
  await page.getByRole("button", { name: /Open cart/ }).click();
  // Collapsed until asked for; only enabled coupons are listed (not the switched-off or automatic ones).
  const list = cart(page).locator(".coupons");
  await expect(list.locator("li")).toBeHidden();
  await list.getByText("View coupon codes").click();
  await expect(list.locator("li")).toBeVisible();
  await expect(list.locator("li")).toHaveCount(1);
  await expect(list.locator("li")).toContainText("TEN");
  await expect(list.locator("li")).toContainText("10% off");
  await expect(list).not.toContainText("OFF");
  // One tap fills the box and the offer applies.
  await list.getByRole("button", { name: "Use code TEN" }).click();
  await expect(cart(page).getByLabel("Coupon code")).toHaveValue("TEN");
  await expect(cart(page).locator(".price-summary")).toContainText("Ten percent (TEN)");
});

test("no coupon list when no coupon is on offer", async ({ page }) => {
  await stubWindowOpen(page);
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Alpha" })], offers: [AUTO] });
  await page.goto("/");
  await add(page);
  await page.getByRole("button", { name: /Open cart/ }).click();
  await expect(cart(page).locator(".coupons")).toHaveCount(0);
});

test("adding an item and handing the order to WhatsApp each play the fireworks, above the cart, then clear", async ({ page }) => {
  await setup(page);
  expect(await isOpen(page)).toBe(false);
  await add(page);
  await expect.poll(() => isOpen(page)).toBe(true);
  await expect(burst(page).locator("svg path").first()).toBeAttached();
  // Not a barrier: taps go through while it plays.
  expect(await burst(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(burst(page)).toHaveAttribute("aria-hidden", "true");
  await expect.poll(() => isOpen(page), { timeout: 6000 }).toBe(false);
  await expect(burst(page).locator("svg")).toHaveCount(0);

  // Checkout: the WhatsApp handoff plays it again, while the cart dialog is open.
  await page.getByRole("button", { name: /Open cart/ }).click();
  await cart(page).getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Asha Rao");
  await page.getByLabel("Mobile number *").fill("9876543210");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue to WhatsApp/ }).click();
  await expect(cart(page).getByText(/WhatsApp opened/)).toBeVisible();
  await expect.poll(() => isOpen(page)).toBe(true);
  await expect.poll(() => isOpen(page), { timeout: 6000 }).toBe(false);
});

test("two quick adds restart one animation instead of stacking them", async ({ page }) => {
  await setup(page);
  await add(page);
  await expect.poll(() => isOpen(page)).toBe(true);
  await add(page, "Beta");
  await expect(burst(page).locator("svg")).toHaveCount(1);
  // lottie edits the data it is given: a reused copy once grew the drawing about twelvefold.
  await page.waitForTimeout(600);
  expect(await burst(page).locator("svg *").count()).toBeLessThan(3000);
  await expect.poll(() => isOpen(page), { timeout: 6000 }).toBe(false);
});

test("with reduced motion the fireworks never appear, and adding still works", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await add(page);
  await expect(page.getByRole("button", { name: "Open cart, 1 units" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await isOpen(page)).toBe(false);
  await expect(burst(page).locator("svg")).toHaveCount(0);
});
