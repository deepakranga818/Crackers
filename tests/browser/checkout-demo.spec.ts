import { test, expect, type Page } from "@playwright/test";
import { networkInterfaces } from "node:os";

// Smoke checks for the local checkout demo (`npm run demo`, port 5180). The demo is for hand
// testing; these prove it starts, stays labelled, keeps its negative cases, and never reaches
// WhatsApp. The real catalogue is covered by the other specs.
const DEMO = "http://127.0.0.1:5180";
const card = (page: Page, text: string) =>
  page.locator(".product-card", { hasText: text });

async function watchWhatsApp(page: Page) {
  const hits: string[] = [];
  await page.addInitScript(() => {
    window.open = () => {
      (window as any).__opened = true;
      return null;
    };
  });
  await page.route(/wa\.me|whatsapp\.com/, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  page.on("popup", (popup) => hits.push(`popup ${popup.url()}`));
  return hits;
}

async function checkoutAsBuyer(page: Page, method: string, delivery = false) {
  await page.getByRole("button", { name: /Open cart/ }).click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Test Buyer");
  await page.getByLabel("Mobile number *").fill("9876543210");
  await page.getByLabel("Fulfilment method *").selectOption({ label: method });
  if (delivery) {
    await page.getByLabel("Address line *").fill("1 Sample Street");
    await page.getByLabel("Locality / area *").fill("Sample Area");
    await page.getByLabel("City *").fill("Sample City");
    await page.getByLabel("State *").fill("Sample State");
    await page.getByLabel("PIN code *").fill("110001");
  }
  await page.getByRole("checkbox").check();
}

test("the demo is labelled everywhere, keeps its negative cases and covers the edge-case products", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(DEMO);
  const label = page.locator(".demo-label");
  await expect(label).toHaveText("Local checkout demo — test data");
  // Pinned: still at the top of the screen after scrolling to the bottom.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(label).toBeInViewport();
  expect((await label.boundingBox())!.y).toBeLessThanOrEqual(1);
  // Sticky header and shop bar sit below it, not under it.
  expect((await page.locator("header").boundingBox())!.y).toBeGreaterThanOrEqual(
    (await label.boundingBox())!.height - 1,
  );
  await expect(page.getByRole("link", { name: "Switch to the actual catalogue" }))
    .toHaveAttribute("href", /:4173\/$/);

  // Negative cases: unknown unit, unreviewed type, unavailable. None can be added.
  for (const [text, why] of [
    ["Tilli bomb", /Unit not confirmed/],
    ["Anar Bomb - 5 piece", /Product type is being reviewed/],
    ["50cm Pogo", /Currently unavailable/],
  ] as const) {
    const blocked = card(page, text).first();
    await blocked.scrollIntoViewIfNeeded();
    await expect(blocked).toContainText(why);
    await expect(blocked.getByRole("button", { name: /Add to cart/ })).toHaveCount(0);
  }

  // Both POP-UP variants can be ordered.
  for (const variant of ["Pop- gol size", "Pop- long size"])
    await expect(card(page, variant).getByRole("button", { name: /Add to cart/ })).toBeVisible();

  // Long name, three photos, no horizontal overflow, gallery usable.
  await page.getByRole("searchbox").fill("Super Deluxe");
  const long = card(page, "Super Deluxe");
  await expect(long).toContainText("3 photos");
  await long.getByRole("button", { name: /^Details for/ }).click();
  await page.getByRole("button", { name: "View product image 3" }).click();
  await expect(page.getByRole("dialog").locator(".demo-tag")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  // Image fallbacks: a photo that fails to load, and a product with no photo at all.
  await page.getByRole("searchbox").fill("Photo that fails");
  const fallback = /Product image\s*coming soon/;
  await expect(card(page, "Photo that fails")).toContainText(fallback);
  await page.getByRole("searchbox").fill("100 Shot");
  await expect(card(page, "100 Shot")).toContainText(fallback);
});

test("a full checkout is a dry run: link and message are shown, WhatsApp is never contacted", async ({
  page,
}) => {
  const hits = await watchWhatsApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(DEMO);
  await card(page, "Pop- gol size").getByRole("button", { name: /Add to cart/ }).click();
  await card(page, "Pop- gol size")
    .getByRole("button", { name: "Increase POP-UP dc-001 quantity" })
    .click();
  await card(page, "Pop- long size").getByRole("button", { name: /Add to cart/ }).click();
  await page.getByRole("searchbox").fill("Super Deluxe");
  await card(page, "Super Deluxe").getByRole("button", { name: /Add to cart/ }).click();

  await checkoutAsBuyer(page, "Sample delivery, ₹50 charge (test data)", true);
  await expect(page.getByRole("dialog").locator(".demo-tag")).toBeVisible();
  const review = page.locator(".review-summary");
  await expect(review.locator(".review-lines li")).toHaveCount(3);
  await expect(review).toContainText("Delivery / fulfilment charge");
  await expect(review).toContainText("₹50");
  await expect(review).toContainText("10% offer (CRACK10)");

  await page.getByRole("button", { name: "Continue to WhatsApp", exact: true }).click();
  const panel = page.locator(".dry-run");
  await expect(panel).toContainText("nothing was sent");
  await expect(panel).toContainText("https://wa.me/919992230740?text=");
  const link = await panel.locator("code").textContent();
  const message = new URL(link!).searchParams.get("text")!;
  expect(message).toContain("*DIWALI CRACKERS ORDER*");
  expect(message).toContain("Qty: 2 × ₹10 = ₹20 (pack of 10 (sample))");
  expect(message).toContain("*Fulfilment:* Delivery");
  expect(message).toContain("1 Sample Street");
  await expect(panel.locator("pre").first()).toHaveText(message);
  await expect(page.getByRole("button", { name: "Run the dry run again" })).toBeEnabled();
  // Copy/save fallbacks stay available after the dry run.
  await page.getByText("Copy or save this order").click();
  await expect(page.getByRole("button", { name: "Download Order" })).toBeVisible();

  // Editing the cart keeps what was typed.
  await page.getByRole("button", { name: "Edit cart", exact: true }).click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await expect(page.getByLabel("Full name *")).toHaveValue("Test Buyer");
  await expect(page.getByLabel("PIN code *")).toHaveValue("110001");

  expect(hits, "no request or popup may reach WhatsApp").toEqual([]);
  expect(await page.evaluate(() => (window as any).__opened)).toBeUndefined();
  await page.getByRole("button", { name: "Close dialog" }).click();
  // The cart survives a refresh.
  await page.reload();
  await expect(page.getByRole("button", { name: /Open cart, 4 units/ })).toBeVisible();
});

// A phone reaches the demo over plain HTTP at a LAN address, which browsers do not treat as a
// secure context: crypto.randomUUID and navigator.clipboard are missing there. Needs the demo
// to be listening on the LAN (`npm run demo:lan`); skipped otherwise.
test("checkout works on a plain-HTTP LAN address", async ({ page }) => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  const url = `http://${lan}:5180`;
  const reachable =
    !!lan &&
    (await fetch(url, { signal: AbortSignal.timeout(2000) }).then(
      (r) => r.ok,
      () => false,
    ));
  test.skip(!reachable, "demo is not listening on the LAN (run npm run demo:lan)");
  const hits = await watchWhatsApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await card(page, "Pop- gol size").getByRole("button", { name: /Add to cart/ }).click();
  await page.getByRole("region", { name: "Cart summary" }).getByRole("button").click();
  await page.getByRole("button", { name: "Proceed to buyer details" }).click();
  await page.getByLabel("Full name *").fill("Test Buyer");
  await page.getByLabel("Mobile number *").fill("9876543210");
  await page.getByLabel("Fulfilment method *").selectOption({ label: "Sample pickup (test data)" });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to WhatsApp", exact: true }).click();
  await expect(page.locator(".dry-run")).toContainText("nothing was sent");
  await expect(page.locator(".dry-run")).toContainText(/REQ-[0-9A-F]{8}/);
  // Copy has no clipboard API here, so the manual-copy fallback appears.
  await page.getByText("Copy or save this order").click();
  await page.getByRole("button", { name: "Copy Complete Order" }).click();
  await expect(page.getByLabel("Select and copy the complete order")).toBeVisible();
  expect(hits).toEqual([]);
});
