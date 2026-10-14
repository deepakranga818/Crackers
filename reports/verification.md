# Verification — 14 October 2026

## Current local results

- `npm run build`: fetched the latest authoritative Google Sheet, imported 46 products with zero errors, passed TypeScript and produced the Vite production bundle. Catalogue version: `a42f190206db`.
- `npm test`: 38 tests passed, including subtotal-tier boundaries at ₹2,000 and ₹5,000, paise rounding, matching automatic coupon codes, WhatsApp encoding, cart restoration, buyer validation and sound scheduling.
- `python -m unittest discover -s tests -p test_import.py`: 3 tests passed. Generated names/categories/prices match the source CSV; invalid names, prices, image URLs and MRP remain represented, disabled and fail import; source offers, coupon codes and contact are validated.
- `npm run test:browser`: 11 Chromium tests passed on Windows. Exact decoded WhatsApp text, all selected items and discounts were checked with navigation intercepted. No message was sent.
- Source sync reused 51 local images for 44 products. The two products without supplied image links retain placeholders. Images and the multi-image gallery pass browser checks.
- Sound requires a click; browser checks detect a nonzero audio signal, verify mute/unmute and prevent autoplay after reload. Physical speaker audibility was not measured.

## Checkout and mobile evidence

Cart → buyer details → WhatsApp, without a separate review screen. Checkout and the message include the matching CRACK10/CRACK15/CRACK20 coupon, subtotal, savings and discounted total. Dummy fixture units/pickup and internal catalogue metadata are omitted from the message.

At 320, 360 and 390 CSS pixels, four-product requests include every item, Unicode notes, ₹140 subtotal, ₹14 savings and ₹126 total. The checkout dialog has no horizontal overflow; screenshots in `screenshots/simple-checkout-*.png` show the simplified form and large controls. The 320px screenshot was visually inspected for this change.

A 46-product order uses inline copy/download preparation when its encoded link exceeds the configured 4,000-character limit. Clipboard and downloaded text retain every item. Quantity changes invalidate the previous preparation. Browser checks cover clipboard failure, selectable-text fallback, blocked popups, offline retry and retained carts. Actual WhatsApp mobile/Web interoperability remains unverified.

Other browser checks cover all 46 catalogue cards, search/filter recovery, dialog focus, removal/undo, saved carts, cross-tab synchronization, corrupted storage, reduced motion, layouts from 320 to 1280px and automated text/zoom approximations. Real Android/iPhone devices and screen readers were not used.

## Data updates and deployment

The owner's Google Sheet is the authoritative source. Start/build fetch it; `npm run sync` refreshes a running local preview. Static hosted sites require rebuilding and redeploying after Sheet edits. Unsupported offers, changed seller contact, or inaccessible data stop sync rather than silently substituting old prices. Blank MRP values are retained as unknown, without an invented crossed-out price.

The localhost preview on port 5173 runs in demo mode. The production configuration retains its existing verification gates. No public deployment or remote CI execution was performed. GitHub push remains pending authentication.

Current build assets: JavaScript 287.56 kB (85.44 kB gzip), CSS 18.61 kB (4.94 kB gzip), HTML 0.66 kB (0.40 kB gzip). Earlier `local-performance.json` measurements precede this checkout change and are not current performance validation.
