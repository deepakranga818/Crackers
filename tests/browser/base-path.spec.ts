import { test, expect } from "@playwright/test";
import { FakeSheet, realShape } from "./sheet-fixture";

// GitHub Pages serves a project site from /<repository>/. This loads the production build
// (built with the normal relative base) from /Crackers/ and checks that the script, styles,
// favicon, image index and saved images all resolve under that path. Nothing is deployed.
test("the production build works from a GitHub Pages project path", async ({ page }) => {
  await new FakeSheet(realShape()).install(page);
  const failed: string[] = [];
  page.on("response", (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  page.on("pageerror", (e) => failed.push(`pageerror ${e.message}`));
  await page.goto("/Crackers/");
  await expect(page.locator(".product-card")).toHaveCount(46);
  const img = page.locator(".product-card img").first();
  await expect(img).toHaveAttribute("src", /^\.\/images\/.+\.webp$/);
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/images/index.json")))).toHaveLength(1);
  expect(await page.locator('link[rel="icon"]').getAttribute("href")).toMatch(/favicon\.svg$/);
  expect(failed).toEqual([]);
  // Everything the page loaded came from under /Crackers/ (or the mocked sheet), never the domain root.
  const outside = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => new URL(e.name)).filter((u) => u.origin === location.origin && !u.pathname.startsWith("/Crackers/")).map((u) => u.pathname),
  );
  expect(outside).toEqual([]);
});
