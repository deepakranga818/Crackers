# Verification — 14 October 2026

## Passed locally

- `npm run build`: reimports all 46 rows, zero import errors, TypeScript passes, Vite production bundle succeeds. Product version `5ff3a6d829d3`. 51 local WebP images represent 44 products; the two source products without image links retain placeholders.
- `npm test`: **30 tests pass**, covering source count, explicit mapping, duplicate names, source image handling, aliases/filtering/sorting, integer-paise arithmetic, malformed quantities, launch gates, current-price restoration, removed/disabled/unavailable products, buyer validation, Indian scripts, service area versus PIN syntax, pickup without residential address, unknown charges, tax verification, recipient/encoding, user-field normalization, stable references and long-message retention. Audio regression tests verify that scheduling waits for context resume, mute cancels a pending resume, and a context that remains suspended is reported as blocked.
- `python -m unittest discover -s tests -p test_import.py`: **2 tests pass**. Every imported name/category/price is compared to the actual XLSX cell. A temporary corrupted workbook confirms invalid rows remain represented, disabled, reported and fail the import. Seller contact G1 matches 9992230740.
- `npm run test:browser`: **9 browser tests pass**, Playwright Chromium 156 on Windows. JSON evidence is in `browser-results.json`.
- `npm audit --omit=dev --audit-level=high`: zero runtime dependency vulnerabilities reported. This is a dependency advisory check, not a complete security audit.
- `node scripts/check-publication.mjs`: deliberately exits nonzero with the public-deployment blocker. Public catalogue and host/legal approval remain unresolved.
- `git diff --cached --check`: no whitespace errors.

The current user-facing localhost preview on port 5173 runs in demo mode so Add to cart, buyer details, request review and WhatsApp controls are visible. Production still builds catalogue-only. Category labels are bold (700), with source variants emphasized (600). Browser test servers use separate ports 5175 (catalogue) and 5174 (demo); mode-specific Vite caches and a single test worker prevent local preview/test startup contention. All 9 browser tests pass after these changes, including the complete WhatsApp URL flow with navigation intercepted.

## Browser scenarios

Production catalogue: all 46 cards, combined search/category filters, zero-results recovery, details and Escape, visible unknown selling units, no ordering/cart controls.

Local demo fixture: add two separate POP-UP products, quantity buttons and direct numeric entry, subtotal, removal and undo, persistence across refresh, buyer errors with focus, Indian-script buyer name and punctuation/emoji notes, pickup without address, complete request review, intercepted WhatsApp URL and exact decoded message, correct number, no automatic cart clearing, disabled audio handling and reduced motion.

Additional scenarios: corrupt/blocked storage, cross-tab synchronization with no writeback loops, explicit clear-cart confirmation and cancellation, details quantity adds the selected amount, dialog focus restoration, long request preserving all 46 items, short-reference link, failed clipboard selectable-text fallback, downloaded text equality, blocked popup and offline retry.

Media fixes: product photos load with nonzero natural dimensions, the supplied second image displays in the gallery, and source rows without photos keep the fallback. A native Web Audio browser test verifies no context is created before a click, detects a nonzero audio signal after enabling sound, verifies running/suspended states when unmuting/muting, and verifies no autoplay after reload. The in-app preview was refreshed and its first product images confirmed loaded; its sound control successfully changed to On. Physical speaker audibility and device mute/volume settings cannot be measured by these tests.

Layout: 320, 360, 390, 430, 768 and 1280 CSS-pixel widths, no document horizontal overflow. Screenshots were visually inspected at mobile and desktop sizes. Browser checks include 200% root text scaling and a 640px CSS viewport representing a 1280px display at 200% browser zoom. These are automated approximations; native OS/browser zoom and screen-reader testing remain manual checks. Actual Android/iPhone devices were not used.

## Local production performance

`node scripts/measure-preview.mjs`, production `vite preview` on localhost, headless Chromium, Windows, no network/CPU throttling, one measured navigation per width:

- 360px: observed LCP **432ms**, observed CLS **0**.
- 1280px: observed LCP **180ms**, observed CLS **0**.
- Both show all 46 products and no horizontal overflow.
- Current production assets: JavaScript **284.38kB / 84.59kB gzip**; CSS **16.12kB / 4.47kB gzip**; HTML **0.66kB / 0.41kB gzip**. The 51 local optimized product images total approximately 5.44MB and are lazy-loaded.

Raw results: `local-performance.json`. This is a local synthetic sample with the imported product photos, not a Core Web Vitals pass, field percentile or ordinary-phone benchmark. INP was not measured. Remeasure in the approved hosted environment.

## Still unverified

- Seller location, licences, current applicable legal restrictions, product certification/permitted types, public catalogue permission and hosting category approval.
- All 46 selling units and actual availability. All 51 linked photos have been imported locally, but publication reuse rights remain unverified. Original photos for 60 Shot and 100 Shot are still missing. Multi-photo gallery and fallback behaviour are now browser-tested.
- Actual pickup/delivery, service areas, charges, tax treatment, business hours, brand, policies and preferred languages.
- Real device WhatsApp installation, Web login, browser popup/navigation behaviour and long-URL interoperability. Automated tests intercept the link and never send a message.
- Screen-reader audit, native 200% zoom, real translated copy and representative low-end Android performance.
- Remote GitHub Actions execution is distinct from these local results; CI is provided, with no automatic deployment.

Source/README/deployment guide are supplied. No public site was deployed and no online payment or automatic message sending was introduced.
