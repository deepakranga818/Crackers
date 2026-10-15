# Diwali crackers catalogue

React + TypeScript + Vite static site for the owner's friends-and-family group. **One Google Sheet is the only source of catalogue and offer data**, read by the browser each time the page loads and refreshed while it is open. Editing the sheet changes the site without a code change, rebuild or redeploy. No backend, payment collection, login, analytics or service worker.

**Default: friends-and-family list, search indexing discouraged.** The list is not access-controlled: the URL is reachable by anyone who has it, and `noindex`/`robots.txt` only ask search engines not to list it. A public launch needs `"audience": "public"` plus every item in `source/verification.json` verified. Do not publish just because checkout controls are hidden. See [launch checklist](docs/LAUNCH.md).

## Run it locally

Node 24 (Python 3.12 + `pip install -r requirements.txt` only for `npm run images`).

```powershell
npm ci
npm run dev        # http://127.0.0.1:5173/ (Vite picks the next free port if 5173 is busy)
npm run build      # typecheck + production build into dist/ (contains no catalogue data)
npm run preview    # http://127.0.0.1:4173/ serves dist/
npm run demo       # http://127.0.0.1:5180/ checkout dry run: WhatsApp is never opened
```

## Where each value comes from

The sheet ID is the single connection setting, in [`sheet.config.json`](sheet.config.json). The page fetches `https://docs.google.com/spreadsheets/d/<id>/export?format=csv` (first tab, public "anyone with the link can view"). That endpoint returns the whole tab as one response with full header text, and Google allows cross-origin reads of it (checked in a real browser by `npm run test:live`), so a static host needs no proxy, key or credentials. `gviz/tq?tqx=out:csv` is deliberately not used: it drops the header text of numeric columns.

| Shown on the site | Sheet source |
|---|---|
| Products, prices, MRP, descriptions, pieces per pack, shots | Products section |
| Categories (chips) | the **Category** values of visible products |
| Stock / "Out of stock" | **Stock** TRUE/FALSE (a flag, never a quantity) |
| Visibility | **Show on website** YES/NO |
| Offers and coupons | COUPONS & OFFERS section |
| Shop name, WhatsApp number | SHOP SETTINGS section |
| Product pictures | **Image links** (see Images) |

Code holds only behaviour: layout, copy, validation, the quantity cap (99), fulfilment methods, and the publication gates. There is no JSON, workbook, category map or hard-coded price, stock, coupon or WhatsApp number in the app.

## Maintaining the sheet

The tab ("Diwali Store") has three sections. Sections are found by their headers and markers, never by row number, so adding rows (which pushes the later sections down), blank rows, and reordering columns are all fine. Do not rename headers (case, spacing and the ₹ sign are ignored) and do not repeat a section marker or header.

**Add a product**: insert a row inside the products table (above `COUPONS & OFFERS`) with a new unique **Product ID** that never changes afterwards (carts are saved by ID). Fill Product name, Category, Selling price, Stock, Show on website; the rest is optional. A new Category value creates a new chip automatically; categories with no visible product disappear.

**Change a price**: edit **Selling price (₹)**. **MRP (₹)** is optional and shown struck through only when it is a number above the selling price; it is a comparison price, not a discount.
**Out of stock**: set **Stock** to FALSE (the product stays visible and cannot be added). TRUE = available. Blank or anything else counts as out of stock.
**Hide**: set **Show on website** to NO (hidden everywhere: catalogue, search, categories). YES shows it. Anything else hides it.
**Pack contents vs firing count**: **Pieces per pack** and **Shots** are separate whole numbers; leave blank when unknown. Nothing is read from names.
**Notes** columns are internal and never reach the page, the cache or WhatsApp.

**Coupons and offers** (COUPONS & OFFERS section; one best offer applies, never stacked):

| Column | Values |
|---|---|
| Mode | `Coupon` (customer types the code) or `Automatic` (no code needed) |
| Coupon code | letters/digits/`-`/`_`, unique among enabled coupons; blank for Automatic |
| Discount type / value | `Percent` + `10` = 10% off (up to 2 decimals, >0 and ≤100) · `Fixed` + `100` = ₹100 off |
| Minimum order / Maximum order | inclusive limits on the subtotal before discounts; blank = no limit; max cannot be below min |
| Enabled | `YES` / `NO` |

The offer saving is the discount on the whole merchandise subtotal, rounded half up to the paise and capped at the subtotal. If several offers qualify, the largest saving wins. **Tie-break:** the coupon the customer entered, then an Automatic offer, then the earlier sheet row. If an Automatic offer beats the customer's coupon, the cart says so. A code entered in any case, with spaces, matches. Invalid offers are ignored (with a console diagnostic); two *enabled* coupons with the same code are both ignored.

**SHOP SETTINGS**: `Shop name` (plain text; if blank the header says "Diwali crackers" and the WhatsApp message has no shop line) and `WhatsApp number` (country code + digits, 11–15 digits). With a missing or invalid number checkout stops with a recoverable message; there is no fallback number.

**Images.** A cell may hold several links separated by new lines. Only `https` links are used.
- A **direct image URL** (`.jpg/.png/.webp/.gif/.avif`, or `i.imgur.com`, `image.prntscr.com`, `img.lightshot.app`) shows straight from the sheet: edits appear on refresh like everything else.
- A **screenshot-page URL** (for example `https://prnt.sc/…`) is a web page, not a picture, and a browser cannot read it cross-origin. The site shows a saved local copy **only if the link is still in the cell and `public/images/index.json` has a copy for exactly that link**. A *new* screenshot link shows a placeholder plus a "View photo" link until you run `npm run images` and publish the new files under `public/images/`. So **screenshot links are not sheet-only**; use direct image URLs for fully automatic updates.
- `npm run images` reads the sheet, reuses saved copies, downloads only missing ones from approved hosts (same public pages a visitor can open; no proxy or credentials) and rewrites `public/images/index.json` (generated, do not edit).

## Live updates, caching and errors

- Fetch on load; refresh about every 60 s while the tab is visible; refresh when the tab becomes visible or the device comes back online and the data is 60 s or older; manual **Refresh** / **Try again**; a **fresh forced fetch before every WhatsApp checkout attempt**. Requests are shared, time out after 15 s, and an older response can never overwrite a newer one.
- A response replaces the on-screen data only after it validates completely, as one snapshot of products + offers + settings. Google can take seconds to minutes to publish an edit, so a refresh may briefly still show the old data; "Prices fetched at …" is when this website fetched, not when the sheet was edited.
- The last valid snapshot is cached in `localStorage` (`diwali-sheet-v2`, catalogue data only, never buyer details) and re-validated with the same rules on read. It is ignored if malformed, from another sheet or version, or has an implausible timestamp. With a cache the site opens instantly and flags "last saved prices" until a fetch succeeds; if refreshing fails the cache stays browsable with a warning that current prices and availability could not be verified. With no cache and no data you get an error screen, never demo or historical products.
- **Which errors reject the whole snapshot:** an HTML/sign-in page or permission error; empty response; a missing, duplicated or repeated section marker/header or required column; duplicate Product IDs; missing offers or settings sections. **Which leave a row usable-but-unavailable:** invalid/zero price (shown "Price unavailable", not orderable), blank/invalid Stock (out of stock), blank/invalid Show (hidden), bad MRP/pieces/shots/image links (that field ignored), an invalid offer (that offer ignored), an invalid WhatsApp number (checkout error only). Row-level detail (section, row, field) is in the browser console and under "Technical details" on the error screen; customers get plain messages.

## Cart and checkout

The cart stores Product IDs, quantities, the coupon text and the names/prices the customer last saw (`diwali-cart-v2`; the old v1 cart is discarded). Prices, stock, visibility and offers are always resolved from the latest snapshot. After a refresh, price changes, items that go out of stock/hidden/removed, and changed offers are listed in a "Your order changed" notice; items are never silently dropped, and checkout waits until unavailable items are removed.

Continue to WhatsApp always fetches the sheet first. If that fails (offline, sign-in page, bad sheet) nothing is prepared and the cart and form are kept with a Retry. If the fresh data differs from what the customer reviewed in product IDs/quantities, names, pack/shots, prices, availability, the offer (identity, code or discount), totals, shop name or the **WhatsApp number**, the changes are shown and nothing opens until the customer accepts; the message is built from exactly the snapshot that fetch returned (background refreshes are held back during the attempt). Opening WhatsApp only prepares a message: nothing is sent until the buyer taps Send there, the cart is kept, and the site never claims the order was sent or confirmed. No delivery charge, payment or confirmation is invented. Orders too long for a link get the existing copy/download fallback.

Preserved from before the live-sheet change: the buyer form and validation (name, mobile, fulfilment method, delivery address/PIN checks), the fulfilment methods, tax handling, the private/public audience gates, the verification flags (`source/verification.json`, none verified), the noindex/robots rules and `scripts/check-publication.mjs`. Removed because the sheet no longer has the data: the per-product selling-unit and category-review gates, the hand-made category list/aliases, the MRP-confirmation gate, and per-product quantity limits.

## Tests

- `npm test` — unit tests (CSV, strict money/percent, section parsing, offers, store/cache/races with fake timers, cart reconciliation, WhatsApp message, launch gates). Fixtures are generated in `tests/helpers/sheet.ts` plus `tests/fixtures/real-shape.csv` (a snapshot of the real sheet's shape; test data only).
- `npx playwright install chromium`, then `npm run test:browser` — **mocked integration**: every test serves a fixture CSV in place of Google (`tests/browser/sheet-fixture.ts`), covering refresh, stock/visibility/categories, failures, cache, checkout review gate, a11y (axe) and layout. `window.open` is stubbed: no WhatsApp link is ever opened.
- `npm run test:live` — the **real sheet** in real Chromium with no mocks: proves cross-origin access (both redirect hops) and that rendered products match the visible valid products parsed from the same live response. It asserts no fixed product count and is not part of CI.
- `npm run test:basepath` — builds, then serves `dist/` under `/Crackers/` like a GitHub Pages project site and checks scripts, styles, favicon and images resolve. Nothing is deployed.
- Observing an actual edit in the online sheet appear after refresh is a manual step (edit a price, press Refresh); automated tests cover the same path with a fake sheet only.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The build is a plain static `dist/` (relative base, works at a domain root or under `/<repository>/`). Hosting is an **unresolved owner decision**: GitHub's Pages terms restrict sites primarily facilitating commercial transactions, and the original brief says not to host the ordering site on Pages, yet `.github/workflows/pages.yml` is configured for the friends-and-family build. A Pages URL is public. The Netlify CSP allows `https://docs.google.com`, `https://*.googleusercontent.com` (the sheet and its redirect) and `https:` images.

## Layout and accessibility

Styles are mobile-first (`src/styles.css`, breakpoints 761px, 1051px, 1500px), system fonts only. The shop bar is sticky and the header from 761px up; `useStickyOffset` (`src/components.tsx`) measures pinned UI and switches stickiness off when it would cover too much of the screen. The category chips are one horizontally scrolling row. Sound is on unless the visitor has muted it: a synthesised firecracker string (`crackerSamples` in `src/sound-player.ts`, no audio file) plays when the page opens, or on the first tap or key where the browser blocks autoplay; the header button mutes it and the choice is remembered. The Lottie fireworks (`src/fireworks.json`, played by `src/fireworks.tsx`, `lottie-web` light build loaded as its own chunk) play on Add to cart and when the order is handed to WhatsApp, above any open dialog, and are skipped under reduced motion. Product images are packaging photos only where the seller supplied them; the diya/firework art and placeholders are original decorative SVG/CSS.
