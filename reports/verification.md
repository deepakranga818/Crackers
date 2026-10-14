# Verification — 14 October 2026

## Passed locally

- `npm run build`: reimports all 46 rows, zero import errors, TypeScript passes, Vite production bundle succeeds. Product version `eadd0b78e859`.
- `npm test`: **27 tests pass**, covering source count, explicit mapping, duplicate names, source image handling, aliases/filtering/sorting, integer-paise arithmetic, malformed quantities, launch gates, current-price restoration, removed/disabled/unavailable products, buyer validation, Indian scripts, service area versus PIN syntax, pickup without residential address, unknown charges, tax verification, recipient/encoding, user-field normalization, stable references and long-message retention.
- `python -m unittest discover -s tests -p test_import.py`: **2 tests pass**. Every imported name/category/price is compared to the actual XLSX cell. A temporary corrupted workbook confirms invalid rows remain represented, disabled, reported and fail the import. Seller contact G1 matches 9992230740.
- `npm run test:browser`: **7 browser tests pass**, Playwright Chromium 156 on Windows. JSON evidence is in `browser-results.json`.
- `npm audit --omit=dev --audit-level=high`: zero runtime dependency vulnerabilities reported. This is a dependency advisory check, not a complete security audit.
- `node scripts/check-publication.mjs`: deliberately exits nonzero with the public-deployment blocker. Public catalogue and host/legal approval remain unresolved.
- `git diff --cached --check`: no whitespace errors.

## Browser scenarios

Production catalogue: all 46 cards, combined search/category filters, zero-results recovery, details and Escape, visible unknown selling units, no ordering/cart controls.

Local demo fixture: add two separate POP-UP products, quantity buttons and direct numeric entry, subtotal, removal and undo, persistence across refresh, buyer errors with focus, Indian-script buyer name and punctuation/emoji notes, pickup without address, complete request review, intercepted WhatsApp URL and exact decoded message, correct number, no automatic cart clearing, disabled audio handling and reduced motion.

Additional scenarios: corrupt/blocked storage, cross-tab synchronization with no writeback loops, explicit clear-cart confirmation and cancellation, details quantity adds the selected amount, dialog focus restoration, long request preserving all 46 items, short-reference link, failed clipboard selectable-text fallback, downloaded text equality, blocked popup and offline retry.

Layout: 320, 360, 390, 430, 768 and 1280 CSS-pixel widths, no document horizontal overflow. Screenshots were visually inspected at mobile and desktop sizes. Browser checks include 200% root text scaling and a 640px CSS viewport representing a 1280px display at 200% browser zoom. These are automated approximations; native OS/browser zoom and screen-reader testing remain manual checks. Actual Android/iPhone devices were not used.

## Local production performance

`node scripts/measure-preview.mjs`, production `vite preview` on localhost, headless Chromium, Windows, no network/CPU throttling, one measured navigation per width:

- 360px: observed LCP **1,536ms**, observed CLS **0**.
- 1280px: observed LCP **168ms**, observed CLS **0**.
- Both show all 46 products and no horizontal overflow.
- Production assets: JavaScript **282.56kB / 84.02kB gzip**; CSS **16.09kB / 4.46kB gzip**; HTML **0.66kB / 0.41kB gzip**.

Raw results: `local-performance.json`. This is a local synthetic sample with placeholders, not a Core Web Vitals pass, field percentile, ordinary-phone benchmark or guarantee after adding real product images. INP was not measured. Remeasure with real assets and the approved hosted environment.

## Still unverified

- Seller location, licences, current applicable legal restrictions, product certification/permitted types, public catalogue permission and hosting category approval.
- All 46 selling units, actual availability and original product photos/reuse rights. All 51 source screenshot links were audited without obtaining usable approved assets. Missing/broken-image fallback is implemented; a real multi-photo gallery must be retested when originals arrive.
- Actual pickup/delivery, service areas, charges, tax treatment, business hours, brand, policies and preferred languages.
- Real device WhatsApp installation, Web login, browser popup/navigation behaviour and long-URL interoperability. Automated tests intercept the link and never send a message.
- Screen-reader audit, native 200% zoom, real translated copy and representative low-end Android performance.
- Remote GitHub Actions execution is distinct from these local results; CI is provided, with no automatic deployment.

Source/README/deployment guide are supplied. No public site was deployed and no online payment or automatic message sending was introduced.
