# Verification — 15 October 2026

Environment: Windows 11, Node 24.14.1, Python 3.12.8, Playwright 1.64 with its bundled Chromium (headless). Everything below was run in this session unless it is listed under "Not tested".

## Results

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc -b` | no errors |
| Unit tests | `npm test` | **63 passed** (was 53) |
| Import tests | `python -m unittest discover -s tests -p test_import.py` | 3 passed |
| Offline build | `npm run build:offline` | built; JS 295.68 kB (88.07 kB gzip), CSS 21.46 kB (5.39 kB gzip), HTML 1.13 kB (before: 287.56 / 18.61 / 0.66 kB) |
| Browser tests | `npm run test:browser` | **39 passed** (was 12 + the 6 new layout runs): a11y 19, layout 6, site 7, checkout 2, fallbacks 3, media 2 |
| Publication gate | `node scripts/check-publication.mjs` | passes for the friends-and-family audience; fixture data and banner are absent from the production bundle |
| Live Sheet | `sync_google_sheet.py` + `import_products.py` in a throwaway copy, then `check-sheet-drift.mjs` | Sheet fetched; 46 products; content hash `e5f47eed280e` equals the committed snapshot (no drift) |

All browser tests run offline against the committed snapshot on three local servers (5175 production data, 5174 demo fixtures, 5176 test-only confirmed units). Checkout runs go through a stubbed `window.open`; **no WhatsApp message was sent.**

## What the redesign changed, measured

Where products start, before → after, from `reports/layout-metrics.json` (screenshots in `reports/redesign/{before,after}/`; motion reduced for stable captures). "Content" means the first card's image, name and price fully inside the screen and not covered by anything (checked with `elementFromPoint`).

| Viewport | Hero height | First card top | Scroll needed to reach it | Sticky UI share of screen | Content visible without scrolling |
|---|---|---|---|---|---|
| 360×800 | 318 → 143 px | 1170 → 474 px | 1162 → 347 px (1.45 → 0.43 screens) | 15% | no → **yes** |
| 390×844 | 491 → 145 px | 1348 → 476 px | 1340 → 349 px (1.59 → 0.41) | 14% | no → **yes** |
| 768×1024 | 392 → 222 px | 1079 → 552 px | 1071 → 365 px (1.05 → 0.36) | 17% | no → **yes** |
| 1366×768 | 425 → 120 px | 998 → 446 px | 990 → 263 px (1.29 → 0.34) | 23% | no → **yes** |
| 640×450 (200% zoom equivalent) | 318 → 146 px | 1101 → 477 px | 1093 → 469 px (2.43 → 1.04) | 0% (sticky switches itself off) | no → no |

Targets asserted by `tests/browser/layout.spec.ts`: search and categories visible without scrolling on phones; first card reachable within 0.5 screens of scrolling (400 / 422 px) with image, name, price and action visible and unobstructed; first-row image, name and price visible at 1366×768 without scrolling; sticky UI at most 20% of the screen on phones and 30% elsewhere; no horizontal page scroll at 320, 360, 390, 430, 768, 1024 and 1366. All pass. At 200% zoom on a 450px-tall window the first card is still about one screen down; that case has no target and is reported as measured.

Reference prices, struck-through MRP and "% off" are no longer shown (every Sheet MRP is exactly 1.4× the price; see `node scripts/mrp-ratio.mjs`). With the unit rule enforced, **0 of 46 products are orderable** until the owner confirms units.

## Accessibility

- **axe-core, WCAG 2.2 A/AA tags including colour contrast: 0 violations** on 10 scans: catalogue, catalogue with offer terms open and a filter, details with an unconfirmed unit, details with gallery and quantity, and cart → buyer → review with the full message open, each at 390px and 1366px. Colour pairs were also measured by hand when choosing tokens (the old `#b67922` focus ring at 3.5:1 and `#8b7252` fallback text at 3.97:1 were replaced; the pairs I measured are all at least 5:1). Pairs I did not hand-measure are covered by axe's contrast rule, which requires 4.5:1 for normal text.
- Keyboard (Playwright): every category chip reachable and unobstructed by the sticky bar at phone and desktop sizes, and activatable with Enter; each card has one obvious Details stop with a visible focus ring and the image is not a second stop; gallery thumbnails and quantity controls work from the keyboard and are at least 44×44 px; dialogs keep focus inside, restore it on Escape and make the page behind inert; Edit details focuses the name field and Edit items returns to the cart with the form kept; no focused control is hidden by sticky UI, including at the 200% zoom equivalent.
- Touch targets: every control on the phone catalogue is at least 44×44 px (links inside a sentence are exempt, WCAG 2.5.8).
- Lighthouse also checks label-in-name (WCAG 2.5.3), which axe's default tags skip; the final runs have no such failures.

## Lighthouse (lab data, not field Core Web Vitals)

Conditions: Lighthouse 12.8.2 against `vite preview` of the offline build on localhost, Playwright's Chromium 156, **simulated throttling** (mobile preset: 4× CPU slowdown and slow-4G emulation; desktop preset), one run each for the final figures.

| | Performance | Accessibility | Best practices | SEO | FCP | LCP | CLS | TBT | Transfer |
|---|---|---|---|---|---|---|---|---|---|
| Mobile | 94 | 100 | 100 | 66 | 1.4 s | 3.0 s | 0 | 80 ms | 1838 KiB |
| Desktop | 99 | 100 | 100 | 66 | 0.4 s | 1.0 s | 0 | 0 ms | 3532 KiB |

SEO 66 is the single failed audit `is-crawlable`: the page is intentionally `noindex`. INP is not measured. No before-redesign Lighthouse run exists, so no performance improvement is claimed.

**A change that was tried and reverted:** loading the first row of images eagerly (and the first with `fetchpriority="high"`) made LCP *worse*: 3.9–4.0 s against 2.9–3.0 s with the original lazy loading (3 runs eager, 2 runs lazy, consistent), with performance 87 against 94. The original lazy loading was kept.

## Defects found and fixed while verifying

- Header overflowed horizontally at 360px in ordering mode (brand + sound + cart); the brand now wraps and the cart shows icon and count on phones.
- Focusing a category chip scrolled the page back to the top: `html { scroll-padding-top }` treated the pinned bar's own chips as covered. Clearance is now per element, and the sticky bar's controls and dialog contents are exempt.
- A half-visible chip stayed half hidden when focused; it is now revealed fully.
- The brand link and footer contact links were 30–33 px tall; now 44 px.
- Label-in-name failures: the sound toggle (visible "Off" vs name), image buttons with a "N photos" badge or the missing-image text, and the brand link.
- The full-width cart drawer left a ~36 px gap on phones (browser default dialog max-width).
- One cold-start browser failure, seen once: with the Vite cache emptied, the first navigation of `media.spec.ts` aborted (`net::ERR_ABORTED`) after 35 s. My explanation is that Vite discovers `react/jsx-dev-runtime` late on a cold cache and reloads the page mid-navigation. I pre-bundled React's runtimes in `vite.config.ts`; the full suite then passed 39/39 on two consecutive runs from an empty cache. The failure did not recur, but I did not reproduce it on demand, so the cause is not proven.
- My first `test:live` drift check compared files containing a `fetchedAt` timestamp and would have failed on every run; it now compares content hashes only (`scripts/check-sheet-drift.mjs`).

## Not tested

- WhatsApp on real Android or iPhone devices and in WhatsApp Web (link opening and message delivery); only the generated URL and text were checked, with navigation intercepted.
- Screen readers (NVDA, VoiceOver, TalkBack) and real touch devices; Firefox and Safari engines.
- Field Core Web Vitals and INP; a before-redesign Lighthouse run.
- `npm run test:live` end to end (it rewrites the source snapshot). Its two halves were run separately: the live sync in a throwaway copy, and the drift script against the snapshot.
- Sound audibility through a physical speaker.
- Real seller permissions, licences, hosting acceptance and serviceability. None are established by these tests.

## Local review setup (added 15 October 2026)

Added after the redesign so the owner can test by hand without deploying: the actual catalogue on the offline production build (`npm run preview`, port 4173) and a separate local checkout demo (`npm run demo`, port 5180) with sample data and a dry-run handoff that never contacts WhatsApp. See `docs/LOCAL_REVIEW.md`.

| Check | Result |
|---|---|
| `npx tsc -b` | no errors |
| `npm test` | **65 passed** (+2: the reference ID works without `crypto.randomUUID`; the production bundle contains no demo or fixture code) |
| `npm run test:browser` (full suite, rerun because shared code changed) | **42 passed** (+3 in `checkout-demo.spec.ts`: labels, negative cases, edge-case products, a dry-run checkout that sees no WhatsApp request or popup, and checkout on a plain-HTTP LAN address) |
| `npm run build:offline` | built; JS 296.08 kB (88.24 kB gzip), CSS 22.86 kB (5.64 kB gzip); 0 demo/fixture strings in `dist/` |
| `vite build --mode checkout-demo` | refused by `vite.config.ts` |
| Smoke: actual catalogue at 127.0.0.1:4173 and 192.168.0.50:4173 | 46 cards, 0 Add buttons, no demo label, no broken images, no console errors |
| Smoke: demo at 127.0.0.1:5180 and 192.168.0.50:5180 | label present, 49 cards (46 + 3 samples) |

**Defect found and fixed:** `makeRequest` built its reference with `crypto.randomUUID()`, which browsers expose only on HTTPS or localhost. Over a plain `http://` LAN address (a phone testing the dev server) checkout would have failed. It now uses `crypto.getRandomValues` with the same `REQ-XXXXXXXX` format. Proved in a real non-secure context (the LAN address, `isSecureContext === false`) and by a unit test.

**Not tested:** reaching the servers from a phone (this machine cannot test its own firewall; Node.js is allowed only on the Public profile and this network is Private); real WhatsApp; the demo's look on a real phone.

