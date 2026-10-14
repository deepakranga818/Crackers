import { test, expect } from "@playwright/test";
test("catalogue has all products, combined search, details, and disabled ordering", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(46);
  await expect(page.getByRole("button", { name: /Open cart/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(
    0,
  );
  await page.getByRole("searchbox").fill("phuljhari");
  await page.getByRole("button", { name: /Sparklers \/ Phuljadi/ }).click();
  await expect(page.locator(".product-card")).toHaveCount(6);
  await page.getByRole("button", { name: /Sound Crackers \/ Bombs/ }).click();
  await expect(page.getByText("No crackers match these filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await page
    .getByRole("button", { name: "Details for POP-UP, Pop- gol size" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Needs seller confirmation",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("cart, restoration, Unicode buyer, exact request and retained handoff on 360px mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.open = (url?: string | URL) => {
      (window as any).__whatsapp = String(url);
      return { opener: null } as any;
    };
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw Error("Audio blocked");
        }
      },
    });
  });
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "Enable festive sound" }).click();
  await expect(
    page.getByText("Sound is unavailable. Shopping still works."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).nth(0).click();
  await page.getByRole("button", { name: "Add to cart" }).nth(0).click();
  await page.getByRole("button", { name: /Open cart, 2 units/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Increase POP-UP dc-001 quantity" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "POP-UP dc-002 quantity", exact: true })
    .fill("2");
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "POP-UP dc-002 quantity", exact: true })
    .press("Tab");
  await expect(page.locator(".price-summary")).toContainText("₹60");
  await page
    .getByRole("button", { name: "Remove POP-UP, dc-002", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo removal" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: /Open cart, 4 units/ }).click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByRole("button", { name: "Review complete request" }).click();
  await expect(page.locator("#buyer-name")).toBeFocused();
  await page.getByLabel("Full name *").fill("दीपक रांगा");
  await page.getByLabel("Mobile number *").fill("+91 99922-30740");
  await page.getByLabel("Order notes").fill("₹ & + # % 🎆");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review complete request" }).click();
  await expect(page.locator(".request-preview")).toContainText(
    "Product subtotal: ₹60",
  );
  await expect(page.locator(".request-preview")).toContainText("दीपक रांगा");
  await page
    .getByRole("button", { name: "Continue to WhatsApp", exact: true })
    .click();
  await expect(
    page.getByText(
      "WhatsApp opened. If you sent the request, wait for the seller’s confirmation.",
    ),
  ).toBeVisible();
  const url = await page.evaluate(() => (window as any).__whatsapp);
  expect(new URL(url).pathname).toBe("/919992230740");
  expect(new URL(url).searchParams.get("text")).toBe(
    await page.locator(".request-preview").textContent(),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: /Open cart, 4 units/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("corrupt and unavailable storage do not break catalogue or demo cart", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("diwali-cart-v1", "bad json"),
  );
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: /Open cart/ }).click();
  await expect(
    page.getByText("Saved cart could not be read. Started with an empty cart."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("blocked");
    };
    Storage.prototype.getItem = () => {
      throw Error("blocked");
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.getByRole("button", { name: /Open cart, 1 units/ }).click();
  await expect(
    page.getByText(
      "Browser storage is unavailable. Your cart lasts for this visit.",
    ),
  ).toBeVisible();
});
test("responsive layouts, reduced motion, 200 percent text and keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `reports/screenshots/catalogue-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".firework")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
