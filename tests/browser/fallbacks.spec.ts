import { test, expect } from "@playwright/test";
import data from "../../src/products.json" with { type: "json" };
import { readFile } from "node:fs/promises";

test("cross-tab updates synchronize units without writeback loops", async ({
  context,
}) => {
  const first = await context.newPage(),
    second = await context.newPage();
  await first.goto("http://127.0.0.1:5174");
  await second.goto("http://127.0.0.1:5174");
  await second.evaluate(() => {
    (window as any).__events = 0;
    addEventListener("storage", () => (window as any).__events++);
  });
  await first.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(
    second.getByRole("button", { name: /Open cart, 1 units/ }),
  ).toBeVisible();
  expect(await second.evaluate(() => (window as any).__events)).toBe(1);
  await second.getByRole("button", { name: /Open cart/ }).click();
  await second.getByRole("button", { name: "Clear cart", exact: true }).click();
  await second.getByRole("button", { name: "Keep items" }).click();
  await expect(second.getByRole("dialog")).toContainText("₹10");
  await second.getByRole("button", { name: "Clear cart", exact: true }).click();
  await second.getByRole("button", { name: "Yes, clear cart" }).click();
  await expect(
    first.getByRole("button", { name: /Open cart, 0 units/ }),
  ).toBeVisible();
});

test("long message, failed clipboard, blocked popup, download and offline retry retain complete request", async ({
  page,
}) => {
  await page.addInitScript(
    ({ version, items }) => {
      localStorage.setItem(
        "diwali-cart-v1",
        JSON.stringify({ schema: 1, catalogueVersion: version, items }),
      );
      window.open = () => null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(Error("Clipboard denied")) },
      });
    },
    {
      version: data.version,
      items: Object.fromEntries(data.products.map((p) => [p.id, 1])),
    },
  );
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: /Open cart, 46 units/ }).click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Test Buyer");
  await page.getByLabel("Mobile number *").fill("9992230740");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review complete request" }).click();
  await expect(page.getByText(/This request is too long/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to WhatsApp", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".request-preview")).toContainText("46. 100 Shot");
  await page.getByRole("button", { name: "Copy Complete Request" }).click();
  await expect(
    page.getByRole("textbox", { name: "Select and copy the complete request" }),
  ).toHaveValue((await page.locator(".request-preview").textContent()) || "");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Request" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(await readFile(path!, "utf8")).toBe(
    await page.locator(".request-preview").textContent(),
  );
  await page
    .getByRole("checkbox", { name: /I have copied the complete request/ })
    .check();
  await page
    .getByRole("button", { name: "Continue to WhatsApp", exact: true })
    .click();
  await expect(page.getByText(/WhatsApp could not open/)).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Open WhatsApp again" }).click();
  await expect(
    page.getByText(/You are offline. Copy or download/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: /Open cart, 46 units/ }),
  ).toBeVisible();
});

test("details quantity selection adds exact amount and focus returns after Escape", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174");
  const opener = page.getByRole("button", {
    name: "Details for POP-UP, Pop- gol size",
  });
  await opener.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Increase POP-UP quantity" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Open cart, 2 units/ }),
  ).toBeVisible();
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});
