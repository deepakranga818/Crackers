# Diwali crackers catalogue

React + TypeScript + Vite, built from the supplied Excel file. All 46 product rows are retained; both POP-UP entries have separate stable IDs. Prices use integer paise. No backend, payment collection, login, analytics, service worker or fabricated stock.

**Default: local catalogue preview, ordering disabled, search indexing disabled.** Public catalogue publication is unverified separately from ordering. Do not publish just because checkout controls are hidden. See [launch checklist](docs/LAUNCH.md).

## Local setup

Install Node 24 and Python 3.12+. From the repository root:

```powershell
python -m pip install -r requirements.txt
npm ci
npm run import
npm run dev
```

Open the printed localhost URL. `npm run build` reimports the workbook, typechecks and writes `dist/`. `npm run preview` serves that build locally. Run `npm test` for unit tests and `npx playwright install chromium` followed by `npm run test:browser` for browser tests. The Playwright configuration starts two localhost servers and records results in `reports/browser-results.json`.

`npm run dev:demo` enables an explicitly labelled **localhost-only** test fixture with invented test units and a test pickup location. Those fixtures are not claims about the seller. They cannot enable ordering on a hosted domain. Never send a demo request to the seller. Browser tests intercept `window.open`; no WhatsApp message is sent.

## Source and updates

- `source/Diwali_Cracker.xlsx`: original source, read only by the Python importer at build time.
- `source/category-map.json`: explicit mapping for every source product number, expected name and original category; source mismatches fail the build. Six composite types are kept under Needs Review.
- `source/product-overrides.json`: seller-confirmed units, availability, enabled flag, quantity limits and verified specifications keyed by stable ID. Do not infer these from price, names or blank Order cells.
- `source/image-manifest.json`: local image paths keyed by product ID.
- `src/business.ts`: brand, contacts, launch gates, permitted fulfilment, charges, tax, policies, sound and SEO.
- `src/pricing.ts`: shared exact paise calculations and orderability checks.
- `src/cart.ts`, `buyer.ts`, `whatsapp.ts`, `audio.ts`: isolated state and validation.
- `reports/import-report.md`, `reports/image-report.md`: reproducible audits.

Replace the workbook and run `npm run import`. Inspect the report and JSON diff. Never reuse a product number for a different product: IDs derive from the source No., not names or display row. Update the explicit mapping for deliberate source changes; count changes require an explicit change to the 46-row integrity contract and tests. Invalid rows are preserved and disabled in generated JSON; any import error fails the build. Do not deploy partially corrected data.

Example override, only after actual seller verification:

```json
{"dc-001":{"sellingUnit":"<actual confirmed unit>","availability":"available","enabled":true,"maxQuantityPerRequest":20,"stockQuantity":null,"verifiedSpecifications":[]}}
```

Source pack text is descriptive evidence only; it does not establish the selling unit. Limits are request limits, not stock. Unknown availability blocks ordering. The owner edits source/configuration and redeploys; there is no fake static admin panel.

## Product images and licences

All 51 source screenshot-page URLs now resolve to real product photographs on Lightshot's current `img.lightshot.app` image host. They have been downloaded and optimized as local WebP assets for 44 products, with multi-image galleries where supplied. `60 Shot` and `100 Shot` have no source photographs and keep the fallback. See the image report. Public reuse rights still require owner verification before publication. Source screenshot links never become runtime image URLs.

`python scripts/resolve_images.py` audits linked pages without downloading image files. `python scripts/resolve_images.py --download-supplied-images` retrieves the workbook-linked assets for an authorized local build. Use `--rights-confirmed` only when the owner has actually confirmed publication reuse rights for all linked assets. The resolver permits reviewed origins only, reports inaccessible/unapproved links, limits download size and never bypasses access controls. If a host changes, manually review before editing the allowlist. Run the importer after updating assets.

The diya/firework SVG and placeholders are original decorative code; they do not depict product packaging. Audio is original Web Audio synthesis (sine tones), with no recordings or external licences. System fonts avoid third-party font requests. No real product-image licence has been established. React, Vite and other dependencies retain their own licences in installed packages/lockfile.

## Cart and handoff semantics

The cart badge counts units. Local storage stores schema, catalogue version, product IDs and quantities only. Current prices are always used; a catalogue version change triggers a review notice. Removed/disabled items and malformed quantities are removed; unknown availability/units flag remaining items and block checkout. Unavailable storage falls back to memory. Storage events update other tabs without writing back.

Buyer details are in React memory only. Returning to the cart preserves the form; Reset buyer details clears it. Refreshing the page intentionally discards buyer details. A reviewed request reference persists in memory for an unchanged request, changes on material edits, and resets on clear/refresh. User fields are flattened to a single line and rendered as text. All optional blank lines are omitted. Totals are shared between cart and request; no GST is assumed.

WhatsApp opens only on explicit action and never automatically sends. Cart is retained. A short retry guard prevents rapid taps. A configured 1,800-character URL threshold conservatively triggers complete copy/download plus a short-reference chat link; this is not a universal browser limit. Manual selectable text appears when clipboard access fails. Product prices, stock and fulfilment require seller confirmation; client totals are not authoritative.

## GitHub and deployment

Repository: https://github.com/deepakranga818/Crackers

See [deployment guide](docs/DEPLOYMENT.md). Do not enable GitHub Pages. Keep secrets, licence scans, customer data and private legal advice out of Git. Store only approval references and non-sensitive configuration here.

## Verification

See [test results](reports/verification.md) for actual commands, browser conditions and remaining checks. Real Android/iPhone WhatsApp behaviour, seller permissions and serviceability cannot be established by a local browser test. No Core Web Vitals pass is claimed without measurements.
