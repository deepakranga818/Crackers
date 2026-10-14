import { test, expect } from "@playwright/test";
import data from "../../src/products.json" with { type: "json" };

test("mobile cart and complete four-product WhatsApp request work at 320, 360 and 390px", async ({
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
    const bar = page.getByRole("region", { name: "Cart summary" });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("₹140");
    const button = bar.getByRole("button", { name: "Review cart, 8 units" });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Proceed to buyer details" })
      .click();
    expect(
      await page
        .getByLabel("Full name *")
        .evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe("16px");
    await page.getByLabel("Full name *").fill("Test Buyer");
    await page.getByLabel("Mobile number *").fill("+91 99922 30740");
    await page.getByLabel("Order notes").fill("₹ & + # % 🎆");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Review complete request" }).click();
    await expect(page.locator(".handoff-preparation")).toHaveCount(0);
    const message = await page.locator(".request-preview").textContent();
    expect(message).toContain("4. 15cm Ronak");
    expect(message).toContain("Product subtotal: ₹140");
    await page
      .getByRole("button", { name: "Continue to WhatsApp", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `reports/screenshots/mobile-review-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Continue to WhatsApp", exact: true })
      .click();
    const url = await page.evaluate(() => (window as any).__whatsapp);
    expect(new URL(url).searchParams.get("text")).toBe(message);
    expect(new URL(url).pathname).toBe("/919992230740");
    expect(
      await page
        .getByRole("dialog")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(bar).toContainText("8 units selected");
    await page.screenshot({
      path: `reports/screenshots/mobile-cart-${width}.png`,
    });
  }
});

test("a long request must be copied in full and re-prepared after changing the cart", async ({
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
  await page.getByRole("button", { name: "Review complete request" }).click();
  await expect(
    page.getByRole("button", { name: "Continue to WhatsApp", exact: true }),
  ).toBeDisabled();
  const complete = await page.locator(".request-preview").textContent();
  await page.getByRole("button", { name: "Copy Complete Request" }).click();
  expect(await page.evaluate(() => (window as any).__copied)).toBe(complete);
  expect(complete).toContain("46. 100 Shot");
  await expect(
    page.getByRole("button", { name: "Continue to WhatsApp", exact: true }),
  ).toBeEnabled();
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
  await page.getByRole("button", { name: "Review complete request" }).click();
  await expect(
    page.getByRole("button", { name: "Continue to WhatsApp", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".request-preview")).toContainText(
    "Total units: 47",
  );
});
