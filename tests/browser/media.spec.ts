import { test, expect } from "@playwright/test";

test("real product assets load, multi-image gallery works, missing images remain honest", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".product-card").first().scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("img", { name: "POP-UP packaging, image 1", exact: true }).first(),
  ).toBeVisible();
  await expect.poll(() => page
    .getByRole("img", { name: "POP-UP packaging, image 1", exact: true })
    .first()
    .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
  ).toBe(true);
  await page
    .getByRole("button", { name: "Details for 15cm Ronak, Phuljadi - Small" })
    .click();
  await page.getByRole("button", { name: "View product image 2" }).click();
  const image = page.getByRole("dialog").getByRole("img");
  await expect(image).toHaveAttribute("alt", "15cm Ronak packaging, image 2");
  await expect(image).toHaveJSProperty("complete", true);
  expect(
    await image.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox").fill("60 Shot");
  await expect(page.locator(".product-card")).toContainText("Product image");
  await expect(page.locator(".product-card img")).toHaveCount(0);
});

test("sound requires a click, produces a nonzero audio signal and can be muted", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    (window as any).__audio = [];
    window.AudioContext = class extends Native {
      constructor() {
        super();
        (window as any).__audio.push(this);
      }
      createGain() {
        const gain = super.createGain();
        const analyser = super.createAnalyser();
        const silent = super.createGain();
        silent.gain.value = 0;
        gain.connect(analyser);
        analyser.connect(silent);
        silent.connect(this.destination);
        ((window as any).__analysers ??= []).push(analyser);
        return gain;
      }
    };
  });
  await page.goto("/");
  expect(await page.evaluate(() => (window as any).__audio.length)).toBe(0);
  await page
    .getByRole("button", { name: "Enable festive sound", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sound on · mute", exact: true }),
  ).toBeVisible();
  const peak = await page.evaluate(async () => {
    let peak = 0;
    for (let n = 0; n < 25; n++) {
      for (const analyser of (window as any).__analysers || []) {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        for (const value of samples) peak = Math.max(peak, Math.abs(value));
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return peak;
  });
  expect(peak).toBeGreaterThan(0.001);
  expect(await page.evaluate(() => (window as any).__audio[0].state)).toBe(
    "running",
  );
  await page
    .getByRole("button", { name: "Sound on · mute", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable festive sound", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__audio[0].state)).toBe(
    "suspended",
  );
  await page.reload();
  expect(await page.evaluate(() => (window as any).__audio.length)).toBe(0);
});
