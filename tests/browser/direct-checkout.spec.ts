import { test, expect } from "@playwright/test";
import data from "../../src/products.json" with { type: "json" };

test("single-step mobile checkout applies Sheet offers and includes every selected item", async ({
  page,
}) => {
  await page.addInitScript(
    ({ version, items }) => {
      localStorage.setItem(
        "diwali-cart-v1",
        JSON.stringify({ schema: 1, catalogueVersion: version, items }),
      );
      window.open = (url?: string | URL) => {
        (window as any).__whatsapp = String(url);
        return { opener: null } as any;
      };
    },
    {
      version: data.version,
      items: Object.fromEntries(
        data.products.slice(0, 4).map((p) => [p.id, 2]),
      ),
    },
  );
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("http://127.0.0.1:5174");
    await expect(
      page.getByText("Coupon code - CRACK10 - 10% off upto 2000"),
    ).toBeVisible();
    const bar = page.getByRole("region", { name: "Cart summary" });
    await expect(bar).toContainText("₹126");
    await bar.getByRole("button").click();
    await page
      .getByRole("button", { name: "Proceed to buyer details" })
      .click();
    await page.getByLabel("Full name *").fill("Test Buyer");
    await page.getByLabel("Mobile number *").fill("9992230740");
    await page.getByLabel("Order notes").fill("₹ & + # % 🎆");
    await page.getByRole("checkbox").check();
    await expect(page.getByLabel("Fulfilment method *")).toHaveCount(0);
    await expect(
      page.getByRole("dialog").getByText(/Local test fixture/),
    ).toHaveCount(0);
    await expect(page.locator(".price-summary")).toContainText("₹140");
    await expect(page.locator(".price-summary")).toContainText("₹126");
    await page.screenshot({
      path: `reports/screenshots/simple-checkout-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Continue to WhatsApp", exact: true })
      .click();
    const url = await page.evaluate(() => (window as any).__whatsapp);
    const message = new URL(url).searchParams.get("text")!;
    expect(new URL(url).pathname).toBe("/919992230740");
    expect(message).toContain("4. *15cm Ronak");
    expect(message).toContain("Offer (10% off): −₹14");
    expect(message).toContain("Coupon: CRACK10");
    expect(message).toContain("Total: ₹126");
    expect(message).toContain("Product subtotal: ₹140");
    expect(message).toContain("*Mobile:* 9992230740");
    expect(message).not.toMatch(/fulfilment|unit|to be confirmed|demo/i);
    await expect(page.locator("body")).not.toContainText(
      /order (sent|confirmed|placed)/i,
    );
    expect(message).not.toContain("Catalogue version");
    expect(message).not.toContain("Demo");
    await expect(page.locator(".request-preview")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Checkout", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Open WhatsApp again" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Open WhatsApp again" }).click();
    expect(await page.evaluate(() => (window as any).__whatsapp)).toBe(url);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(bar).toContainText("8 units selected");
  }
});

test("long orders prepare complete details inline and cart edits invalidate the copied order", async ({
  page,
}) => {
  await page.addInitScript(
    ({ version, items }) => {
      localStorage.setItem(
        "diwali-cart-v1",
        JSON.stringify({ schema: 1, catalogueVersion: version, items }),
      );
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__copied = text;
          },
        },
      });
      window.open = (url?: string | URL) => {
        (window as any).__whatsapp = String(url);
        return { opener: null } as any;
      };
    },
    {
      version: data.version,
      items: Object.fromEntries(data.products.map((p) => [p.id, 1])),
    },
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("http://127.0.0.1:5174");
  await page
    .getByRole("region", { name: "Cart summary" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Test Buyer");
  await page.getByLabel("Mobile number *").fill("9992230740");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Continue to WhatsApp", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue to WhatsApp", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Checkout", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy Complete Order" }).click();
  expect(await page.evaluate(() => (window as any).__copied)).toContain(
    "46. *100 Shot",
  );
  await page
    .getByRole("button", { name: "Continue to WhatsApp", exact: true })
    .click();
  await expect(
    page.getByText(/WhatsApp opened. Paste the complete request/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit cart", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Increase POP-UP dc-001 quantity" })
    .click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page
    .getByRole("button", { name: "Continue to WhatsApp", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue to WhatsApp", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Copy Complete Order" }).click();
  expect(await page.evaluate(() => (window as any).__copied)).toContain(
    "1. *POP-UP (Pop- gol size)* — Qty: 2 × ₹10 = ₹20",
  );
});
