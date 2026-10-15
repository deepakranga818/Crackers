import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { FakeSheet, realShape } from "./sheet-fixture";

// Fixture copy of the real sheet's shape (46 rows), not the live sheet.
test.beforeEach(async ({ page }) => {
  await new FakeSheet(realShape()).install(page);
});

test("cross-tab updates synchronize the cart without writeback loops", async ({ context }) => {
  const first = await context.newPage(),
    second = await context.newPage();
  const fake = new FakeSheet(realShape());
  await fake.install(first);
  await fake.install(second);
  await first.goto("/");
  await second.goto("/");
  await second.evaluate(() => {
    (window as any).__events = 0;
    addEventListener("storage", () => (window as any).__events++);
  });
  await first.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(second.getByRole("button", { name: /Open cart, 1 units/ })).toBeVisible();
  expect(await second.evaluate(() => (window as any).__events)).toBe(1);
  await second.getByRole("button", { name: /Open cart/ }).click();
  await second.getByRole("button", { name: "Clear cart", exact: true }).click();
  await second.getByRole("button", { name: "Keep items" }).click();
  await expect(second.getByRole("dialog")).toContainText("₹10");
  await second.getByRole("button", { name: "Clear cart", exact: true }).click();
  await second.getByRole("button", { name: "Yes, clear cart" }).click();
  await expect(first.getByRole("button", { name: /Open cart, 0 units/ })).toBeVisible();
});

test("long order supports manual copying, download and popup fallback; offline blocks preparing a new request", async ({ page }) => {
  const ids = Array.from({ length: 46 }, (_, i) => `PRD-${String(i + 1).padStart(4, "0")}`);
  await page.addInitScript(
    ({ items }) => {
      localStorage.setItem("diwali-cart-v2", JSON.stringify({ schema: 2, items, coupon: "" }));
      window.open = () => null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(Error("Clipboard denied")) },
      });
    },
    { items: Object.fromEntries(ids.map((id) => [id, 1])) },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Open cart, 46 units/ }).click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Test Buyer");
  await page.getByLabel("Mobile number *").fill("9876543210");
  await page.getByRole("checkbox").check();
  const go = page.getByRole("button", { name: "Continue to WhatsApp", exact: true });
  await go.click();
  await expect(go).toBeDisabled();
  // A long order keeps its inline copy/download section and a collapsed full message.
  await expect(page.locator(".review-lines li")).toHaveCount(46);
  await expect(page.locator(".complete-message")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Copy Complete Order" }).click();
  const text = page.getByRole("textbox", { name: "Select and copy the complete order" });
  const message = await text.inputValue();
  expect(message).toContain("46. *100 Shot*");
  expect(message).toContain("(ID: PRD-0046)");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Order" }).click();
  expect(await readFile(await (await downloading).path(), "utf8")).toBe(message);
  await page.getByRole("checkbox", { name: /I have copied the full order/ }).check();
  await go.click();
  await expect(page.getByText(/WhatsApp could not open/)).toBeVisible();
  // Offline: current prices cannot be confirmed, so nothing is prepared; the cart is kept.
  await page.context().setOffline(true);
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page.getByRole("alert")).toContainText("You are offline");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("button", { name: /Open cart, 46 units/ })).toBeVisible();
});

test("details quantity selection adds the exact amount and focus returns after Escape", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Details for POP-UP, Pop- gol size" });
  await opener.click();
  await page.getByRole("dialog").getByRole("button", { name: "Increase POP-UP quantity" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("button", { name: /Open cart, 2 units/ })).toBeVisible();
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});
