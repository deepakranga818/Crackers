import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import data from "../../src/products.json" with { type: "json" };

// Production configuration (no confirmed units): catalogue and details.
const PRODUCTION = "/";
// Production-style private list with test-only confirmed units: cart, review and checkout.
const FIXTURE = "http://127.0.0.1:5176";
const phone = { width: 390, height: 844 };
const desktop = { width: 1366, height: 768 };
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  // Print readable evidence if anything fails.
  expect(
    results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
    })),
  ).toEqual([]);
}
async function openCheckout(page: Page) {
  await page.getByRole("button", { name: "Add to cart" }).nth(0).click();
  await page.getByRole("button", { name: "Add to cart" }).nth(1).click();
  const bar = page.getByRole("region", { name: "Cart summary" });
  if (await bar.isVisible()) await bar.getByRole("button").click();
  else await page.getByRole("button", { name: /Open cart/ }).click();
}
async function fillBuyer(page: Page) {
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Deepak Rana");
  await page.getByLabel("Mobile number *").fill("9992230740");
  await page.getByRole("checkbox").check();
}

for (const [name, size] of Object.entries({ phone, desktop })) {
  test.describe(`axe (WCAG 2.2 AA) at ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(size);
    });
    test("catalogue", async ({ page }) => {
      await page.goto(PRODUCTION);
      await page.locator(".product-card").first().waitFor();
      await scan(page);
    });
    test("catalogue with the offer terms open and a filter active", async ({
      page,
    }) => {
      await page.goto(PRODUCTION);
      await page.getByText("View terms").click();
      await page.getByRole("searchbox").fill("phuljhari");
      await scan(page);
    });
    test("product details with an unconfirmed unit", async ({ page }) => {
      await page.goto(PRODUCTION);
      await page
        .getByRole("button", { name: "Details for POP-UP, Pop- gol size" })
        .click();
      await scan(page);
    });
    test("details with a gallery, quantity and add action", async ({ page }) => {
      await page.goto(FIXTURE);
      await page
        .getByRole("button", { name: "Details for 15cm Ronak, Phuljadi - Small" })
        .click();
      await scan(page);
    });
    test("cart, buyer details and the review block", async ({ page }) => {
      await page.goto(FIXTURE);
      await openCheckout(page);
      await scan(page);
      await fillBuyer(page);
      await page.getByText("View the complete WhatsApp message").click();
      await scan(page);
    });
  });
}

test.describe("keyboard", () => {
  for (const [name, size] of Object.entries({ phone, desktop })) {
    test(`every category chip is reachable and never hidden under the sticky bar at ${name}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(size);
      await page.goto(PRODUCTION);
      await page.locator(".product-card").first().waitFor();
      const chips = page.locator(".categories button");
      const count = await chips.count();
      expect(count).toBe(10);
      // Scroll the page first so the sticky bar is pinned, then walk the chips with the keyboard.
      await page.evaluate(() => window.scrollTo(0, 700));
      await chips.first().focus();
      for (let i = 0; i < count; i++) {
        const focused = page.locator(".categories button:focus");
        await expect(focused).toHaveCount(1);
        const visible = await focused.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            Math.min(innerWidth - 1, Math.max(0, (r.left + r.right) / 2)),
            Math.min(innerHeight - 1, Math.max(0, (r.top + r.bottom) / 2)),
          );
          return {
            unobstructed: !!hit && el.contains(hit),
            onScreen: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= 0,
            ring: getComputedStyle(el).outlineStyle,
          };
        });
        expect(visible.unobstructed, `chip ${i} unobstructed`).toBe(true);
        expect(visible.onScreen, `chip ${i} on screen`).toBe(true);
        if (i < count - 1) await page.keyboard.press("Tab");
      }
      // The last chip ("More products") can be activated from the keyboard.
      await page.keyboard.press("Enter");
      await expect(chips.last()).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".product-card")).toHaveCount(5);
    });
  }

  test("each card has one obvious keyboard stop for details, and the image is not a second stop", async ({
    page,
  }) => {
    await page.goto(PRODUCTION);
    await page.locator(".product-card").first().waitFor();
    await expect(page.getByRole("button", { name: /^Details for / })).toHaveCount(46);
    await expect(page.locator(".image-button")).toHaveCount(46);
    expect(
      await page
        .locator(".image-button")
        .evaluateAll((els) => els.every((el) => el.tabIndex === -1)),
    ).toBe(true);
    // Tab from the search box through the chips: the first card stop is the Details button.
    await page.getByRole("button", { name: /More products/ }).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAccessibleName(
      "Details for POP-UP, Pop- gol size",
    );
    // A visible focus ring, not just a focused element.
    expect(
      await page
        .locator(":focus")
        .evaluate((el) => getComputedStyle(el).outlineStyle !== "none"),
    ).toBe(true);
  });

  test("gallery thumbnails and quantity controls work from the keyboard and are 44px targets", async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    await page.goto(FIXTURE);
    await page
      .getByRole("button", { name: "Details for 15cm Ronak, Phuljadi - Small" })
      .click();
    const dialog = page.getByRole("dialog");
    const second = dialog.getByRole("button", { name: "View product image 2" });
    await second.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("img")).toHaveAttribute(
      "alt",
      "15cm Ronak packaging, image 2",
    );
    await expect(second).toHaveAttribute("aria-pressed", "true");
    for (const target of [
      second,
      dialog.getByRole("button", { name: "Increase 15cm Ronak quantity" }),
      dialog.getByRole("button", { name: "Decrease 15cm Ronak quantity" }),
      dialog.getByRole("textbox", { name: "15cm Ronak quantity" }),
    ]) {
      const box = (await target.boundingBox())!;
      expect(box.width, "target width").toBeGreaterThanOrEqual(44);
      expect(box.height, "target height").toBeGreaterThanOrEqual(44);
    }
    const plus = dialog.getByRole("button", { name: "Increase 15cm Ronak quantity" });
    await plus.focus();
    await page.keyboard.press("Space");
    await expect(
      dialog.getByRole("textbox", { name: "15cm Ronak quantity" }),
    ).toHaveValue("2");
  });

  test("dialogs keep focus inside, restore it on Escape and leave the page inert behind them", async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    await page.goto(FIXTURE);
    const opener = page.getByRole("button", {
      name: "Details for POP-UP, Pop- gol size",
    });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      // Tab may leave the document for the browser's own UI (focus lands on body), but it must
      // never reach the page behind the dialog.
      expect(
        await page.evaluate(() => {
          const el = document.activeElement;
          return !el || el === document.body || !!el.closest("dialog[open]");
        }),
        `focus stays in the dialog or leaves the page after ${i + 1} tabs`,
      ).toBe(true);
    }
    // Background controls cannot take focus while the dialog is open.
    expect(
      await page.evaluate(() => {
        const bg = document.querySelector<HTMLElement>(".categories button")!;
        bg.focus();
        return document.activeElement === bg;
      }),
    ).toBe(false);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("review actions: Edit details focuses the name field and Edit items returns to the cart", async ({
    page,
  }) => {
    await page.setViewportSize(phone);
    await page.goto(FIXTURE);
    await openCheckout(page);
    await fillBuyer(page);
    await page.getByRole("button", { name: "Edit details" }).click();
    await expect(page.locator("#buyer-name")).toBeFocused();
    await page.getByRole("button", { name: "Edit items" }).click();
    await expect(
      page.getByRole("button", { name: "Proceed to buyer details" }),
    ).toBeVisible();
    // The form entries survive going back to edit the items.
    await page.getByRole("button", { name: "Proceed to buyer details" }).click();
    await expect(page.getByLabel("Full name *")).toHaveValue("Deepak Rana");
  });

  test("a focused control is never hidden by the sticky UI, including at 200% zoom", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // 640x450 is a 1280x900 window at 200% zoom.
    await page.setViewportSize({ width: 640, height: 450 });
    await page.goto(PRODUCTION);
    await page.locator(".product-card").first().waitFor();
    // At this size the sticky UI would cover too much of the screen, so it switches itself off.
    await expect(page.locator("html")).toHaveAttribute("data-sticky-off", "");
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    const hit = await page.locator(":focus").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const e = document.elementFromPoint(
        Math.min(innerWidth - 1, Math.max(0, (r.left + r.right) / 2)),
        Math.min(innerHeight - 1, Math.max(0, (r.top + r.bottom) / 2)),
      );
      return !!e && el.contains(e);
    });
    expect(hit).toBe(true);
  });
});

test.describe("touch targets", () => {
  test("every control on the phone catalogue is at least 44 x 44 CSS px", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(phone);
    await page.goto(FIXTURE);
    await page.locator(".product-card").first().waitFor();
    await page.getByText("View terms").click();
    const small = await page.evaluate(() => {
      const found: string[] = [];
      const controls = document.querySelectorAll<HTMLElement>(
        "a[href], button, input:not([type=hidden]), select, textarea, summary",
      );
      for (const el of controls) {
        const style = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || style.visibility === "hidden") continue;
        // Links inside a sentence follow the text and are exempt (WCAG 2.5.8 inline exception).
        if (el.tagName === "A" && el.closest("p, li")) continue;
        // The skip link is off screen until focused.
        if (el.classList.contains("skip-link")) continue;
        // A checkbox is operated through its 44px-tall label.
        if (el instanceof HTMLInputElement && el.type === "checkbox") continue;
        if (r.width < 43.5 || r.height < 43.5)
          found.push(
            `${el.tagName.toLowerCase()}.${el.className} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
      }
      return found;
    });
    expect(small).toEqual([]);
  });
});

test("catalogue data used by these checks is the committed snapshot", () => {
  expect(data.products).toHaveLength(46);
});
