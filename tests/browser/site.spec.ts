import { test, expect } from "@playwright/test";
import { FakeSheet, product, products, sheet } from "./sheet-fixture";

// Mocked integration tests: a fake sheet stands in for Google, so counts here are fixture
// counts, not business rules. See live-sheet.spec.ts for the real sheet.
const card = (page: import("@playwright/test").Page, name: string) =>
  page.locator(".product-card").filter({ hasText: name });
const refresh = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Refresh", exact: true }).click();

test("renders products from the sheet; Notes and internal text never reach the page", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Alpha", notes: "INTERNAL-NOTE-123" }), product(2, { name: "Beta", category: "Rockets" })] });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(2);
  await expect(card(page, "Alpha").locator(".price-row")).toContainText("₹100");
  await expect(card(page, "Alpha").locator(".price-row del")).toHaveText(/₹140/);
  await expect(page.getByRole("button", { name: /Sky shot 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rockets 1/ })).toBeVisible();
  expect(await page.content()).not.toContain("INTERNAL-NOTE-123");
  await expect(page.getByText(/Prices fetched at/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Test Shop" }).first()).toBeVisible();
});

test("an MRP that is missing, equal or lower is never struck through", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "NoMrp", mrp: "" }), product(2, { name: "Equal", mrp: "₹100.00" }), product(3, { name: "Lower", mrp: "₹50.00" }), product(4, { name: "Junk", mrp: "abc" })] });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(4);
  await expect(page.locator(".product-card .price-row del")).toHaveCount(0);
});

test("a new product, a new category and a price edit appear after Refresh, with no reload or code change", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: products(2) });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(2);
  fake.set({ products: [product(1, { price: "₹250.00" }), product(2), product(3, { name: "Brand New", category: "Fountains" })] });
  await refresh(page);
  await expect(page.locator(".product-card")).toHaveCount(3);
  await expect(card(page, "Product 1").locator(".price-row")).toContainText("₹250");
  await expect(page.getByRole("button", { name: /Fountains 1/ })).toBeVisible();
});

test("the page refreshes by itself about every 60 seconds while visible", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: products(1) });
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(1);
  const before = fake.requests;
  fake.set({ products: products(2) });
  await page.clock.fastForward(61_000);
  await expect(page.locator(".product-card")).toHaveCount(2);
  expect(fake.requests).toBeGreaterThan(before);
});

test("stock FALSE keeps the product visible as Out of stock and blocks adding it", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Gone", stock: "FALSE" }), product(2, { name: "Here" }), product(3, { name: "Blank", stock: "" })] });
  await page.goto("/");
  await expect(card(page, "Gone")).toContainText("Out of stock");
  await expect(card(page, "Gone").getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  await expect(card(page, "Blank")).toContainText("Out of stock");
  await expect(card(page, "Here").getByRole("button", { name: "Add to cart" })).toBeVisible();
  // No invented scarcity.
  await expect(page.locator("body")).not.toContainText(/only \d+ left|remaining|hurry/i);
  await card(page, "Gone").getByRole("button", { name: /Details/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Out of stock");
  await expect(page.getByRole("dialog").getByRole("button", { name: /Add to cart/ })).toHaveCount(0);
});

test("stock flips after refresh: a product becomes unavailable, then available again", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Flip" })] });
  await page.goto("/");
  await expect(card(page, "Flip").getByRole("button", { name: "Add to cart" })).toBeVisible();
  fake.set({ products: [product(1, { name: "Flip", stock: "false" })] });
  await refresh(page);
  await expect(card(page, "Flip")).toContainText("Out of stock");
  fake.set({ products: [product(1, { name: "Flip", stock: "TRUE" })] });
  await refresh(page);
  await expect(card(page, "Flip").getByRole("button", { name: "Add to cart" })).toBeVisible();
});

test("Show on website NO hides a product everywhere; categories with no visible product vanish", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Shown" }), product(2, { name: "Secret", category: "Only hidden", show: "NO" })] });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Only hidden/ })).toHaveCount(0);
  await page.getByRole("searchbox").fill("Secret");
  await expect(page.getByText("No crackers match these filters")).toBeVisible();
});

test("a selected category that disappears falls back to All and keeps search and sort", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Aa one", category: "Alpha" }), product(2, { name: "Aa two", category: "Alpha" }), product(3, { name: "Zeta", category: "Beta" })] });
  await page.goto("/");
  await page.getByRole("searchbox").fill("aa");
  await page.getByLabel("Sort products").selectOption("high");
  await page.getByRole("button", { name: /^Alpha/ }).click();
  await expect(page.locator(".product-card")).toHaveCount(2);
  fake.set({ products: [product(2, { name: "Aa two", category: "Gamma" }), product(3, { name: "Zeta", category: "Beta" })] });
  await refresh(page);
  await expect(page.getByRole("button", { name: /^All products/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox")).toHaveValue("aa");
  await expect(page.getByLabel("Sort products")).toHaveValue("high");
  await expect(page.locator(".product-card")).toHaveCount(1);
});

test("pieces per pack and shots are shown independently and only when valid", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({
    products: [
      product(1, { name: "PackOnly", pieces: "5" }),
      product(2, { name: "ShotsOnly", shots: "100" }),
      product(3, { name: "Both", pieces: "10", shots: "25" }),
      product(4, { name: "12 shot Named", shots: "12" }),
      product(5, { name: "Neither", pieces: "0", shots: "x" }),
    ],
  });
  await page.goto("/");
  await expect(card(page, "PackOnly").locator(".facts")).toHaveText("5 pieces per pack");
  await expect(card(page, "ShotsOnly").locator(".facts")).toHaveText("100 shots");
  await expect(card(page, "Both").locator(".facts li")).toHaveText(["10 pieces per pack", "25 shots"]);
  // The name already says "12 shot": the card does not repeat it, the details do.
  await expect(card(page, "12 shot Named").locator(".facts")).toHaveCount(0);
  await card(page, "12 shot Named").getByRole("button", { name: /Details/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Shots12");
  await page.keyboard.press("Escape");
  await expect(card(page, "Neither").locator(".facts")).toHaveCount(0);
});

test("images: a direct URL renders, a broken one and a missing one fall back; page links offer View photo", async ({ page }) => {
  await page.route("https://cdn.example.test/ok.png", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") }),
  );
  await page.route("https://cdn.example.test/broken.png", (r) => r.fulfill({ status: 404, body: "no" }));
  const fake = await new FakeSheet().install(page);
  fake.set({
    products: [
      product(1, { name: "Direct", images: "https://cdn.example.test/ok.png" }),
      product(2, { name: "Broken", images: "https://cdn.example.test/broken.png" }),
      product(3, { name: "NoImage", images: "" }),
      product(4, { name: "Screenshot", images: "https://prnt.sc/not-downloaded-yet" }),
    ],
  });
  await page.goto("/");
  await expect(card(page, "Direct").locator("img")).toHaveAttribute("src", "https://cdn.example.test/ok.png");
  await expect(card(page, "Broken").getByText(/Product image/)).toBeVisible();
  await expect(card(page, "NoImage").getByText(/Product image/)).toBeVisible();
  await expect(card(page, "Screenshot").getByText(/Product image/)).toBeVisible();
  await expect(card(page, "Screenshot").getByRole("link", { name: /View photo/ })).toHaveAttribute("href", "https://prnt.sc/not-downloaded-yet");
  // Every product stays usable.
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(4);
});

test("a saved local copy is used only for a screenshot link still in the sheet cell", async ({ page }) => {
  await page.route("**/images/index.json", (r) => r.fulfill({ json: { "https://prnt.sc/saved": "images/dc-001-1.webp", "https://prnt.sc/removed": "images/dc-002-1.webp" } }));
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "Saved", images: "https://prnt.sc/saved" }), product(2, { name: "Changed", images: "https://prnt.sc/different" })] });
  await page.goto("/");
  await expect(card(page, "Saved").locator("img")).toHaveAttribute("src", /images\/dc-001-1\.webp$/);
  await expect(card(page, "Changed").locator("img")).toHaveCount(0);
});

test("long names, long categories and long descriptions stay inside their cards on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const fake = await new FakeSheet().install(page);
  const long = "Extraordinarily".repeat(12);
  fake.set({ products: [product(1, { name: `Giant ${long} sky shot`, category: `Category ${long}`, desc: `Description ${long}` })] });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.locator(".product-card").getByRole("button", { name: /Details/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test("markup in sheet text is displayed as text, never executed", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1, { name: "<img src=x onerror=window.__pwned=1>", desc: "<script>window.__pwned=1</script>", category: "<b>Bold</b>" })], settings: [["Shop name", "<i>Shop</i>"], ["WhatsApp number", "919876543210"]] });
  await page.goto("/");
  await expect(page.locator(".product-card h3")).toHaveText("<img src=x onerror=window.__pwned=1>");
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  expect(await page.locator(".product-card h3 img, .product-card b, header i").count()).toBe(0);
});

test("duplicate Product IDs are rejected as a whole: no products, a plain message", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [product(1), product(1)] });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /couldn’t load/ })).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(0);
  await expect(page.getByText(/being updated and can’t be read/)).toBeVisible();
  // Developer detail is available, and names the row and field.
  await page.getByText("Technical details").click();
  await expect(page.locator(".dev-details pre")).toContainText("Duplicate Product ID");
});

test("empty catalogue: an explanation, not a blank page", async ({ page }) => {
  const fake = await new FakeSheet().install(page);
  fake.set({ products: [] });
  await page.goto("/");
  await expect(page.getByText("No crackers are listed right now")).toBeVisible();
  fake.set({ products: products(1) });
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.locator(".product-card")).toHaveCount(1);
});

test.describe("loading and failure states", () => {
  test("initial loading is announced, then replaced by products", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    fake.delayMs = 800;
    await page.goto("/");
    await expect(page.getByText("Loading the latest prices…")).toBeVisible();
    await expect(page.locator(".product-card")).toHaveCount(2);
  });
  test("a sign-in page is reported as an access problem, with Try again", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    fake.body = "<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head></html>";
    fake.contentType = "text/html; charset=utf-8";
    await page.goto("/");
    await expect(page.getByText(/isn’t available to the public/)).toBeVisible();
    await expect(page.locator(".product-card")).toHaveCount(0);
    fake.body = sheet();
    fake.contentType = "text/csv";
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".product-card")).toHaveCount(2);
  });
  test("HTTP 403 and a network failure with no cache show an error, never demo products", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    fake.status = 403;
    await page.goto("/");
    await expect(page.getByText(/isn’t available to the public/)).toBeVisible();
    fake.status = 200;
    fake.abort = true;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(/couldn’t reach the price list/)).toBeVisible();
    await expect(page.locator(".product-card")).toHaveCount(0);
  });
  test("a failed refresh keeps products browsable and says prices could not be verified", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    await page.goto("/");
    await expect(page.locator(".product-card")).toHaveCount(2);
    fake.abort = true;
    await refresh(page);
    await expect(page.getByText(/couldn’t check for the latest prices/)).toBeVisible();
    await expect(page.locator(".product-card")).toHaveCount(2);
    fake.abort = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(/couldn’t check for the latest prices/)).toHaveCount(0);
  });
  test("an invalid sheet on refresh never replaces the good data", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    fake.set({ products: [product(1, { name: "Good" })] });
    await page.goto("/");
    await expect(page.locator(".product-card h3")).toHaveText("Good");
    fake.body = sheet({ products: [product(1, { name: "Bad" }), product(1, { name: "Bad" })] });
    await refresh(page);
    await expect(page.getByText(/couldn’t check for the latest prices/)).toBeVisible();
    await expect(page.locator(".product-card h3")).toHaveText("Good");
  });
});

test.describe("cached and uncached start-up, offline, tab resume", () => {
  test("cached start-up shows saved data immediately while a slow fetch runs, then updates", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    fake.set({ products: [product(1, { name: "Saved copy", price: "₹100.00" })] });
    await page.goto("/");
    await expect(card(page, "Saved copy")).toBeVisible();
    fake.set({ products: [product(1, { name: "Saved copy", price: "₹120.00" })] });
    fake.delayMs = 1500;
    await page.reload();
    await expect(card(page, "Saved copy")).toBeVisible();
    await expect(page.getByText(/Showing the last saved prices/)).toBeVisible();
    await expect(card(page, "Saved copy").locator(".price-row")).toContainText("₹120", { timeout: 8000 });
    await expect(page.getByText(/Showing the last saved prices/)).toHaveCount(0);
  });
  test("offline browsing: products stay, flagged as unverified, and recover when back online", async ({ page, context }) => {
    const fake = await new FakeSheet().install(page);
    await page.goto("/");
    await expect(page.locator(".product-card")).toHaveCount(2);
    fake.abort = true;
    await context.setOffline(true);
    await refresh(page);
    await expect(page.locator(".product-card")).toHaveCount(2);
    await expect(page.getByText(/couldn’t check for the latest prices/)).toBeVisible();
    await expect(page.getByText(/You are offline/)).toBeVisible();
    fake.abort = false;
    await context.setOffline(false);
    await expect(page.getByText(/couldn’t check for the latest prices/)).toHaveCount(0, { timeout: 10_000 });
  });
  test("cached start-up with the sheet unreachable stays browsable and flagged", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    await page.goto("/");
    await expect(page.locator(".product-card")).toHaveCount(2);
    fake.abort = true;
    await page.reload();
    await expect(page.locator(".product-card")).toHaveCount(2);
    await expect(page.getByText(/couldn’t check for the latest prices/)).toBeVisible();
  });
  test("an old or corrupt cache is ignored, not trusted", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    fake.abort = true;
    await page.addInitScript(() => {
      localStorage.setItem("diwali-sheet-v2", JSON.stringify({ schema: 2, spreadsheetId: "other-sheet", fetchedAt: Date.now(), snapshot: { products: [] } }));
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /couldn’t load/ })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("diwali-sheet-v2"))).toBeNull();
  });
  test("tab hidden then shown after 60 s+ refreshes; shown again right away does not", async ({ page }) => {
    const fake = await new FakeSheet().install(page);
    fake.set({ products: products(1) });
    await page.clock.install();
    await page.goto("/");
    await expect(page.locator(".product-card")).toHaveCount(1);
    const setVisibility = (state: "hidden" | "visible") =>
      page.evaluate((s) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await setVisibility("hidden");
    const hiddenAt = fake.requests;
    await page.clock.fastForward(5 * 60_000);
    expect(fake.requests).toBe(hiddenAt); // no polling in the background
    fake.set({ products: products(3) });
    await setVisibility("visible");
    await expect(page.locator(".product-card")).toHaveCount(3);
    const after = fake.requests;
    await setVisibility("visible");
    await page.waitForTimeout(100);
    expect(fake.requests).toBe(after); // data is fresh: no extra request
  });
});
