# Local review guide

Two servers, two origins, so carts and settings never mix:

| What | URL | Command |
|---|---|---|
| **Actual catalogue** (production build, real data) | http://127.0.0.1:4173/ | `npm run build:offline` then `npm run preview` |
| **Local checkout demo** (sample data, dry-run handoff) | http://127.0.0.1:5180/ | `npm run demo` |

No environment variables are needed. Both commands work offline: `build:offline` imports the committed Sheet snapshot (it does not fetch the Sheet). `npm run dev`, `dev:demo` and `build` do fetch the Sheet; avoid them for this review.

Stop a server with Ctrl+C in its terminal. Restart with the same command. After you change code, rebuild (`npm run build:offline`) and restart `npm run preview`; the demo reloads by itself.

## Actual catalogue

Expect **browse-only**: 46 products, no Add to cart buttons, no cart, banner "Browsing only until selling units are confirmed". That is correct: none of the 46 products has a seller-confirmed selling unit yet. It becomes orderable only when the owner supplies units (see [LAUNCH.md](LAUNCH.md)). Nothing in the demo changes that.

## Local checkout demo

Started with `vite --mode checkout-demo`. It is built from the committed snapshot by `demo/make-demo-data.mjs` and never reads or writes `source/product-overrides.json` or the verification settings.

- **Labelled:** a blue "Local checkout demo — test data" bar stays pinned at the top of every screen, and the same tag sits at the top of the cart and details dialogs. A link in the banner returns to the actual catalogue (port 4173 on the same host).
- **Cannot reach production:** the code runs only under the Vite dev server in `checkout-demo` mode. `vite build --mode checkout-demo` fails on purpose, and `npm test` scans the built `dist/` for demo and fixture strings.
- **Dry run:** "Continue to WhatsApp" does not open WhatsApp and sends nothing. It shows the exact link (`https://wa.me/919992230740?text=…`), the recipient, the reference, the link length and the message. The recipient is the real seller number; the demo never contacts it. The footer's "Open WhatsApp" link is hidden. The phone number link (tel:) is still the real number: do not tap it.
- **Sample data, all marked "(sample)":** units (pack of 10, box of 5, single piece, pack of 25), availability, and three fulfilment choices: pickup (free), delivery with a ₹50 charge, and delivery whose charge the seller confirms. Delivery PINs that pass: 110001 and 560001; any other valid PIN shows the outside-service-area error. The offers are the real ones from the Sheet.

What the demo contains on purpose:

| Case | Where | Expected |
|---|---|---|
| Both POP-UP variants | "Pop- gol size" (dc-001) and "Pop- long size" (dc-002) | both can be added |
| Long name and variant, 3 photos, price with paise | "Sample · Super Deluxe Multicolour…" (search "Super Deluxe") | wraps without overflow, "3 photos", gallery 1–3, ₹24.50 |
| Photo that fails to load | "Sample · Photo that fails to load" | "Product image coming soon" |
| Product with no photo | "60 Shot", "100 Shot" | "Product image coming soon" |
| Quantity limit and big price | "Sample · Limited to 5 per request" (₹1,200) | a quantity above 5 is refused ("Enter a whole quantity from 1 to 5."); useful for the ₹2,000 and ₹5,000 offer tiers |
| **Negative:** unknown unit | "Tilli bomb" (dc-003), "40cm Sikha" (dc-008) | "Unit not confirmed · can't be ordered yet", no Add button |
| **Negative:** unavailable | "50cm Pogo" (dc-009) | "Currently unavailable", no Add button |
| **Negative:** unreviewed type | the five "More products" items (dc-029, 030, 031, 037, 038) | "Product type is being reviewed", no Add button |

## Phone testing (same network only)

Use the LAN commands instead; they bind to all network interfaces of this computer:

```powershell
npm run demo:lan        # demo,      port 5180
npm run preview:lan     # catalogue, port 4173 (after npm run build:offline)
```

On this computer the active LAN address was **192.168.0.50** (wired Ethernet; Wi-Fi was disconnected), so the phone URLs are `http://192.168.0.50:5180/` (demo) and `http://192.168.0.50:4173/` (catalogue). Find yours with `ipconfig`. Notes:

- The phone and the computer must be on the same network (the same router). `localhost` and `127.0.0.1` on the phone mean the phone itself, so they will not work.
- No tunnel is created and nothing is exposed to the internet. Stop the servers when you finish; anyone on the same network can open the URLs while they run.
- Windows may block the connection. The existing Node.js firewall rules here allow only the **Public** profile, while this network is **Private**. If the phone cannot connect, allow Node.js on private networks when Windows asks, or from an administrator PowerShell: `New-NetFirewallRule -DisplayName "Node dev (private)" -Direction Inbound -Program "<path to node.exe>" -Action Allow -Profile Private`. Remove it afterwards.
- An `http://` LAN address is not a "secure context". Differences you will see: the Clipboard API is missing, so "Copy Complete Order" shows the manual select-and-copy box instead; `crypto.randomUUID` is missing (the request reference now uses `getRandomValues`, so checkout still works); Add to Home Screen and service workers are unavailable (the site uses none). Layout, touch, the keyboard, sound and `localStorage` behave normally.
- The demo is the Vite dev server (unminified, slower to load than the production build). Judge speed on the catalogue at port 4173, not the demo.

## Manual checklist

Tick each at a phone width (~390px) and a desktop width (~1366px).

1. **Layout:** no sideways scrolling; the first product card appears within about half a screen of scrolling on the phone; one row of category chips on desktop.
2. **Sticky controls:** scroll far down. The demo bar stays; search and categories stay (desktop: header too); nothing covers the product you are looking at. Zoom the browser to 200% or rotate the phone to landscape: the page should switch to normal scrolling instead of a bar that fills the screen.
3. **Category scrolling:** on the phone, swipe the chips sideways; the right edge shows a fade; the active chip stays visible; a category with 0 results is dashed.
4. **Search, filter, sort:** search "phuljadi", "anar", "Super Deluxe"; "Clear filters" works; every sort option reorders.
5. **Dialogs:** open Details on a card; Escape closes it and focus returns to that card; the page behind cannot be tapped or tabbed; the gallery thumbnails switch photos; the demo tag is at the top.
6. **Cart:** add several items; use − and +; type a quantity directly (try 0, 100 and a letter); Remove, then **Undo removal** within about 6 seconds; **Clear cart** asks for confirmation; refresh the page and the cart is restored.
7. **Mobile keyboard:** tap Full name, Mobile number, PIN; check the right keyboard appears (text, number pad) and the field stays visible above the keyboard; the Continue button is reachable.
8. **Validation:** submit empty (focus jumps to the first error); a mobile number that is not 10 digits starting 6–9; delivery with PIN 400001 (outside area); do not tick the acknowledgement.
9. **Offers and totals:** ₹2,000 or less gives 10%, above ₹2,000 up to ₹5,000 gives 15%, above ₹5,000 gives 20% (use the ₹1,200 sample product ×2 = ₹2,400, ×5 = ₹6,000). Check the discount and the ₹50 charge (×5 with the ₹50 delivery gives ₹6,000 − ₹1,200 + ₹50 = ₹4,850). The amount is always labelled "Estimated amount", never "Total", because tax treatment is not verified. The other delivery choice shows "Seller will confirm" for the charge and "+ applicable fulfilment charge".
10. **Review:** every item, variant, unit, quantity and price, the discount, the charge, buyer, fulfilment and notes are listed. "Edit items" and "Edit cart" go back to the cart and **keep what you typed**; "View the complete WhatsApp message" shows the full text.
11. **Dry run:** Continue to WhatsApp shows "nothing was sent", the link and the message; nothing opens. To see the long-order path (link over 4,000 characters), add about 25 different products or write a long note: you must Copy or Download first, and the demo then shows the short link plus the complete request.
12. **Copy and download:** "Copy or save this order" works. On the phone's HTTP address, Copy falls back to the manual box.
13. **Image fallbacks:** the broken-photo sample, "60 Shot", "100 Shot".
14. **Sound:** "Enable festive sound" needs a tap; add/remove/handoff tones play at a low volume; turn it off and reload (the choice is remembered).
15. **Reduced motion:** turn on "reduce motion" in the phone's or computer's accessibility settings; the diya and firework animation stops.

## Known limitations

- The demo handoff is a dry run, so real WhatsApp opening, the Android/iOS app switch and delivery of a message are **not** tested by it.
- "1 units" wording appears in a few labels and the cart notice (existing wording, cosmetic).
- Sample units, availability and fulfilment are invented. They say nothing about what the seller actually sells, how, or where.
- Screen readers, Firefox and Safari were not tested. The phone test is the first real-device check.
