import { test, expect, type Page } from "@playwright/test";
import { FakeSheet, realShape } from "./sheet-fixture";

test.beforeEach(async ({ page }) => {
  await new FakeSheet(realShape()).install(page);
});

test("saved product images load, the multi-image gallery works, products without images stay honest", async ({ page }) => {
  await page.goto("/");
  await page.locator(".product-card").first().scrollIntoViewIfNeeded();
  const first = page.getByRole("img", { name: "POP-UP packaging, image 1", exact: true }).first();
  await expect(first).toBeVisible();
  await expect
    .poll(() => first.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true);
  await page.getByRole("button", { name: "Details for 15cm Ronak, Phuljadi - Small" }).click();
  await page.getByRole("button", { name: "View product image 2" }).click();
  const image = page.getByRole("dialog").getByRole("img");
  await expect(image).toHaveAttribute("alt", "15cm Ronak packaging, image 2");
  await expect(image).toHaveJSProperty("complete", true);
  expect(await image.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox").fill("60 Shot");
  await expect(page.locator(".product-card")).toContainText("Product image");
  await expect(page.locator(".product-card img")).toHaveCount(0);
});

// Counts the firecracker buffers started, and routes every gain through an analyser so the test
// can see a real, nonzero signal. `block` makes the context behave like a browser that refuses
// sound until the visitor has touched the page (this test browser lets pages autoplay, and treats
// every page it opens as already touched, so the "touch" is tracked here instead).
async function watchAudio(page: Page, block = false) {
  await page.addInitScript((block) => {
    const Native = window.AudioContext;
    (window as any).__audio = [];
    (window as any).__crackers = 0;
    let touched = false;
    for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, () => (touched = true), true);
    window.AudioContext = class extends Native {
      constructor() {
        super();
        (window as any).__audio.push(this);
      }
      get state() {
        return block && !touched ? "suspended" : super.state;
      }
      resume() {
        // Blocked: the promise stays pending until the visitor has tapped, as in Chrome.
        return block && !touched ? new Promise<void>(() => {}) : super.resume();
      }
      createBufferSource() {
        (window as any).__crackers++;
        return super.createBufferSource();
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
  }, block);
}
const soundOn = (page: Page) => page.getByRole("button", { name: "Sound on · mute", exact: true });
const soundOff = (page: Page) => page.getByRole("button", { name: "Enable festive sound", exact: true });

const crackers = (page: Page) => page.evaluate(() => (window as any).__crackers as number);

test("sound is on from the start, the firecrackers play on load (or the first tap) with a nonzero signal, and muting is remembered", async ({ page }) => {
  await watchAudio(page);
  await page.goto("/");
  // Never shown as muted: the button reads "Sound on" from the first paint.
  await expect(soundOn(page)).toBeVisible();
  await expect(soundOff(page)).toHaveCount(0);
  // Whether the browser (or a slow CI machine) lets the load-time attempt through is not
  // guaranteed, so the promise tested is: playing by itself, or on the first tap.
  await page.waitForTimeout(900);
  if (!(await crackers(page))) await page.locator("h1").click();
  await expect.poll(() => crackers(page)).toBe(1);
  const peak = await page.evaluate(async () => {
    let peak = 0;
    for (let n = 0; n < 40; n++) {
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
  expect(await page.evaluate(() => (window as any).__audio[0].state)).toBe("running");
  await soundOn(page).click();
  await expect(soundOff(page)).toBeVisible();
  expect(await page.evaluate(() => (window as any).__audio[0].state)).toBe("suspended");
  // Muted stays muted: after a reload nothing is created, and tapping the page starts nothing.
  await page.reload();
  await page.locator("h1").click();
  expect(await page.evaluate(() => (window as any).__audio.length)).toBe(0);
  await expect(soundOff(page)).toBeVisible();
});

test("an old 'muted' value from the earlier opt-in version does not keep anyone silent", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("diwali-sound", "false"));
  await page.goto("/");
  await expect(soundOn(page)).toBeVisible();
});

test("where the browser blocks autoplay, sound still reads On, and the first tap on the page starts the firecrackers, once", async ({ page }) => {
  await watchAudio(page, true);
  await page.goto("/");
  await expect(soundOn(page)).toBeVisible();
  await page.waitForTimeout(700); // longer than the load-time attempt waits
  expect(await crackers(page)).toBe(0);
  await page.locator("h1").click();
  await expect.poll(() => crackers(page)).toBe(1);
  await page.locator("h1").click();
  await page.waitForTimeout(400);
  expect(await crackers(page)).toBe(1);
  await expect(soundOn(page)).toBeVisible();
});

test("where autoplay is blocked, pressing the sound button first mutes (it was on) and the crackers never start; pressing again turns it back on", async ({ page }) => {
  await watchAudio(page, true);
  await page.goto("/");
  await soundOn(page).click();
  await expect(soundOff(page)).toBeVisible();
  await page.locator("h1").click(); // a later tap must not start anything while muted
  await page.waitForTimeout(400);
  expect(await crackers(page)).toBe(0);
  await expect(soundOff(page)).toBeVisible();
  await soundOff(page).click();
  await expect(soundOn(page)).toBeVisible();
  await page.locator("h1").click();
  await page.waitForTimeout(400);
  expect(await crackers(page)).toBe(0); // the chime played; the crackers are only for page open
});
