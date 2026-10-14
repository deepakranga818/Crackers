# Diwali crackers catalogue

React + TypeScript + Vite for the owner's office/locality group. The authoritative source is the [Google Sheet](https://docs.google.com/spreadsheets/d/1T21rN-iyxcuJyIyYxU-ARjhnqwDrMSRVWH8Z_wWpI2E/edit?gid=1949134617), including prices, products, images and offers. All 46 product rows are retained; both POP-UP entries have separate stable IDs. Prices use integer paise. No backend, payment collection, login, analytics, service worker or fabricated stock.

**Default: local catalogue preview, ordering disabled, search indexing disabled.** Public catalogue publication is unverified separately from ordering. Do not publish just because checkout controls are hidden. See [launch checklist](docs/LAUNCH.md).

## Local setup

Install Node 24 and Python 3.12+. From the repository root:

```powershell
python -m pip install -r requirements.txt
npm ci
npm run import
npm run dev
```

Open the printed localhost URL. `npm run dev`, `npm run dev:demo` and `npm run build` fetch and validate the latest Google Sheet first. New or changed photos are downloaded; unchanged local images are reused. Build then typechecks and writes `dist/`. `npm run preview` serves that build locally. Run `npm test` for unit tests and `npx playwright install chromium` followed by `npm run test:browser` for browser tests. The Playwright configuration starts two localhost servers and records results in `reports/browser-results.json`.

For the interactive preview with **cart → buyer details → WhatsApp (no separate review screen)**, run `npm run dev:demo -- --port 5173` and open http://127.0.0.1:5173/. Stop the catalogue dev server on that port first. `npm run dev` remains the catalogue-only preview.

`npm run dev:demo` enables an explicitly labelled **localhost-only** test fixture with invented test units and a test pickup location. Those fixtures are not claims about the seller. They cannot enable ordering on a hosted domain. Never send a demo request to the seller. Browser tests intercept `window.open`; no WhatsApp message is sent.

## Source and updates

- `scripts/sync_google_sheet.py`: read-only export of the supplied Sheet/gid; inaccessible or unsupported data fails sync without silently using old prices.
- `source/google-sheet.csv` and `source/google-sheet-meta.json`: cached snapshot, source URL, fetched time, contact, source hash and offer tiers.
- `source/Diwali_Cracker.xlsx`: historical input, no longer used by normal builds. Explicit historical import remains available.
- `source/category-map.json`: explicit mapping for every source product number, expected name and original category; source mismatches fail the build. Six composite types are kept under Needs Review.
- `source/product-overrides.json`: seller-confirmed units, availability, enabled flag, quantity limits and verified specifications keyed by stable ID. Do not infer these from price, names or blank Order cells.
- `source/image-manifest.json` and `source/image-provenance.json`: local assets and their exact source URLs; changed links cannot silently reuse an old photo.
- `src/business.ts`: brand, contacts, launch gates, permitted fulfilment, charges, tax, policies, sound and SEO.
- `src/pricing.ts`: shared exact paise calculations and orderability checks.
- `src/cart.ts`, `buyer.ts`, `whatsapp.ts`, `audio.ts`: isolated state and validation.
- `reports/import-report.md`, `reports/image-report.md`: reproducible audits.

Update the Google Sheet, then run `npm run sync` to refresh the running local preview, or restart it. Hosted static sites need a fresh build and redeployment; editing the Sheet alone does not instantly update an existing deployment. Do not edit cached CSV/generated JSON as a competing source. Inspect reports and diffs. New IDs or changed names/categories need category-map review; valid prices update directly. Removed products disappear. Invalid rows remain represented/disabled and fail the build. Never reuse a source No. for a different product.

`npm run build:offline` explicitly builds the last fetched Sheet snapshot for local work; it does not claim latest data.

## Sheet offers

The owner confirmed one discount on the whole product subtotal: 10% through ₹2,000 inclusive; 15% above ₹2,000 through ₹5,000 inclusive; 20% above ₹5,000. The matching Sheet coupon (currently CRACK10, CRACK15 or CRACK20) applies automatically without a separate entry field and appears in checkout and WhatsApp. The percentages, codes and boundaries come from the Sheet, and integer-paise rounding occurs once on the total discount. Cart, checkout and WhatsApp use the same calculation. Supported updated offer lines are imported; ambiguous/unsupported text blocks sync for review. Columns are matched by header name, including optional MRP; blank MRP values never create a fabricated crossed-out price.

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

The buyer form opens WhatsApp directly: there is no separate review page. The concise message contains name/mobile, every product/category/quantity/line amount, subtotal, the Sheet offer and amount. Internal IDs, catalogue versions, timestamps and dummy pickup details are omitted. The buyer must tap Send in WhatsApp; availability and fulfilment still need seller confirmation. Cart is retained.

Below the configurable 4,000-character encoded URL threshold, the full order is prefilled. Longer orders get a small copy/download panel inside the same form; copying or manual attachment acknowledgement is required before opening the reference-only chat link. Paste/attach all details and tap Send there. Nothing is truncated; edits invalidate prepared text. Clipboard failure exposes selectable complete text. No universal device URL limit is claimed.

Mobile checkout includes a fixed cart/subtotal bar, full-height cart and buyer views, large touch buttons, 16px form fields to avoid mobile auto-zoom, and a single-column catalogue on very narrow screens. Safe-area padding and content space keep the cart bar from covering the end of the page.

## GitHub and deployment

Repository: https://github.com/deepakranga818/Crackers

See [deployment guide](docs/DEPLOYMENT.md). Do not enable GitHub Pages. Keep secrets, licence scans, customer data and private legal advice out of Git. Store only approval references and non-sensitive configuration here.

## Verification

See [test results](reports/verification.md) for actual commands, browser conditions and remaining checks. Real Android/iPhone WhatsApp behaviour, seller permissions and serviceability cannot be established by a local browser test. No Core Web Vitals pass is claimed without measurements.
