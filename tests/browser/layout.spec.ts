import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// Measures where shopping content lands at real viewports and, in the "after" phase, asserts
// the numeric targets. LAYOUT_PHASE=before records the baseline without asserting targets.
// Each viewport writes its own file (merged by scripts/merge-layout.mjs), so tests never
// overwrite one another.
const phase = process.env.LAYOUT_PHASE ?? "after";
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 640, height: 450 }, // 200% zoom equivalent of a 1280x900 window
];

// Runs in the page. "Meaningful content" = image, name, price (and the action on phones)
// fully inside the visible area and not covered by anything: elementFromPoint at the centre
// of each part must land inside that part.
function measure() {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const rect = (el: Element | null | undefined) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
  };
  const sticky = [...document.querySelectorAll<HTMLElement>("body *")].filter(
    (el) => getComputedStyle(el).position === "sticky",
  );
  const stickyStack = sticky.reduce((sum, el) => sum + el.offsetHeight, 0);
  const pinned = sticky
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.top <= 1 && r.bottom > 0);
  const stickyBottom = pinned.length ? Math.max(...pinned.map((r) => r.bottom)) : 0;
  const card = document.querySelector<HTMLElement>(".product-card");
  const parts: Record<string, Element | null | undefined> = {
    image: card?.querySelector(".product-image"),
    name: card?.querySelector("h3"),
    price: card?.querySelector(".price-row strong"),
    action: [...(card?.querySelectorAll("button") ?? [])].find((b) =>
      /add to cart|details for/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
    ),
  };
  const visible: Record<string, boolean> = {};
  for (const [key, el] of Object.entries(parts)) {
    const r = el?.getBoundingClientRect();
    if (!el || !r) {
      visible[key] = false;
      continue;
    }
    const inside =
      r.top >= stickyBottom - 0.5 && r.bottom <= vh + 0.5 && r.left >= 0 && r.right <= vw;
    const hit = document.elementFromPoint(
      Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2)),
      Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2)),
    );
    visible[key] = inside && !!hit && el.contains(hit);
  }
  const search = document.querySelector('input[type="search"], [role="searchbox"]');
  const chips = document.querySelector(".categories");
  const within = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    return !!r && r.top >= 0 && r.bottom <= vh && r.height > 0;
  };
  return {
    scrollY: window.scrollY,
    stickyStack,
    stickyBottom,
    hero: rect(document.querySelector(".hero"))?.height ?? null,
    cardTopAbs: card ? card.getBoundingClientRect().top + window.scrollY : null,
    cardHeight: card ? card.getBoundingClientRect().height : null,
    visible,
    searchVisible: within(search),
    chipsVisible: within(chips),
    overflowX: document.documentElement.scrollWidth > vw,
  };
}
const measureAt = (page: Page, y: number) =>
  page
    .evaluate((top) => window.scrollTo(0, top), y)
    .then(() => page.waitForTimeout(100))
    .then(() => page.evaluate(measure));

for (const { width, height } of viewports) {
  test(`layout at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator(".product-card").first().waitFor();
    await page.locator(".product-card img").first().waitFor();
    const shots = `reports/redesign/${phase}`;
    mkdirSync(shots, { recursive: true });
    mkdirSync("reports/layout", { recursive: true });

    const top = await measureAt(page, 0);
    await page.screenshot({ path: `${shots}/${width}x${height}-top.png` });
    // One short scroll: bring the first card just under the sticky UI.
    const need = Math.max(0, Math.round((top.cardTopAbs ?? 0) - top.stickyStack - 8));
    const scrolled = await measureAt(page, need);
    await page.screenshot({ path: `${shots}/${width}x${height}-scrolled.png` });

    writeFileSync(
      `reports/layout/${phase}-${width}x${height}.json`,
      JSON.stringify(
        {
          phase,
          width,
          height,
          heroHeight: top.hero,
          firstCardTop: top.cardTopAbs,
          scrollNeededToReachFirstCard: need,
          scrollNeededAsShareOfViewport: Number((need / height).toFixed(2)),
          stickyStack: scrolled.stickyStack,
          stickyShareOfViewport: Number((scrolled.stickyStack / height).toFixed(2)),
          visibleAtTop: top.visible,
          visibleAfterScroll: scrolled.visible,
          searchAndChipsVisibleAtTop: top.searchVisible && top.chipsVisible,
          horizontalOverflow: top.overflowX || scrolled.overflowX,
        },
        null,
        2,
      ) + "\n",
    );

    // Always true, in both phases.
    expect(top.overflowX || scrolled.overflowX, "no horizontal page scroll").toBe(false);
    if (phase !== "after") return;

    const phone = width <= 480;
    expect.soft(scrolled.stickyStack / height, "sticky share of viewport").toBeLessThanOrEqual(
      phone ? 0.2 : 0.3,
    );
    if (phone) {
      expect.soft(top.searchVisible && top.chipsVisible, "search and chips visible at top").toBe(
        true,
      );
      expect.soft(need, "first card within one short scroll (0.5 x viewport)").toBeLessThanOrEqual(
        Math.floor(height * 0.5),
      );
      for (const part of ["image", "name", "price", "action"])
        expect
          .soft(scrolled.visible[part], `first card ${part} visible after scroll`)
          .toBe(true);
    }
    if (width >= 1024 && height >= 700)
      for (const part of ["image", "name", "price"])
        expect.soft(top.visible[part], `first-row card ${part} visible at scrollY 0`).toBe(true);
    testInfo.annotations.push({ type: "need", description: String(need) });
  });
}

test("no horizontal page scroll at 320, 430 and 1024", async ({ page }) => {
  for (const width of [320, 430, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator(".product-card").first().waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `overflow at ${width}`).toBe(false);
  }
});
