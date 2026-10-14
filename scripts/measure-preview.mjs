import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const results = [];
for (const width of [360, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.bringToFront();
  await page.addInitScript(() => {
    window.__measure = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__measure.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (!entry.hadRecentInput) window.__measure.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/screenshots/production-${width}.png` });
  await page.waitForTimeout(200);
  const metrics = await page.evaluate(() => ({
    ...window.__measure,
    lcp: window.__measure.lcp || null,
    viewportWidth: innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    products: document.querySelectorAll(".product-card").length,
  }));
  results.push(metrics);
  await page.screenshot({
    path: `reports/screenshots/production-${width}.png`,
  });
  if (width === 1280) {
    await page.setViewportSize({ width: 640, height: 450 });
    await page.screenshot({ path: "reports/screenshots/zoom-equivalent.png" });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Overflow at zoom-equivalent CSS viewport");
  }
  await page.close();
}
await browser.close();
await writeFile(
  "reports/local-performance.json",
  JSON.stringify(
    {
      conditions:
        "Single cold-page loads, headless Chromium, local production Vite preview, Windows, no CPU/network throttling. Not field Core Web Vitals; INP not measured.",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
