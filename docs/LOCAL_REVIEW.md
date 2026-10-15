# Local review guide

Three local servers, three origins, so carts and settings never mix. All of them read the **live Google Sheet** in the browser (needs internet).

| What | URL | Command |
|---|---|---|
| **Development site** (live sheet, hot reload) | http://127.0.0.1:5173/ (Vite prints the actual port if 5173 is busy) | `npm run dev` |
| **Production build** (what gets deployed) | http://127.0.0.1:4173/ | `npm run build` then `npm run preview` |
| **Local checkout demo** (live sheet, sample fulfilment, dry-run handoff) | http://127.0.0.1:5180/ | `npm run demo` |

No environment variables are needed. Stop a server with Ctrl+C. Edits you make in the Google Sheet appear in any of them within about a minute, or press **Refresh** under the banner. The footer's "Prices fetched at" time is when the *website* last fetched; it is not the sheet's edit time.

## Local checkout demo

Started with `vite --mode checkout-demo` (dev server only; `vite build --mode checkout-demo` fails on purpose, and `npm test` scans the built `dist/` for demo strings). Its data is the same live sheet; only the fulfilment methods are samples.

- **Labelled:** a "Local checkout demo — test data" bar stays pinned at the top of every screen, and the same tag sits at the top of the cart and details dialogs. A banner link returns to the production build (port 4173 on the same host).
- **Dry run:** "Continue to WhatsApp" does not open WhatsApp and sends nothing. It still fetches the sheet first, then shows the exact link (`https://wa.me/<number from the sheet>?text=…`), the recipient, the reference, the link length and the message. The footer's "Open WhatsApp" link is hidden. The `tel:` link is the real number: do not tap it.
- **Sample fulfilment, marked "(test data)":** pickup (free), delivery with a ₹50 charge, and delivery whose charge the seller confirms. Delivery PINs that pass: 110001 and 560001; any other valid PIN shows the outside-service-area error.

## Phone testing (same network only)

```powershell
npm run demo:lan        # demo,       port 5180
npm run preview:lan     # production, port 4173 (after npm run build)
```

Use this computer's LAN address (`ipconfig`), for example `http://192.168.0.50:5180/`. The phone and computer must share a network; `localhost` on the phone means the phone itself. No tunnel is created; stop the servers when finished. Windows may ask to allow Node.js on private networks. An `http://` LAN address is not a secure context: the Clipboard API is missing (Copy falls back to the manual select-and-copy box) and `crypto.randomUUID` is absent (the request reference uses `getRandomValues`, so checkout still works). The Vite dev server is slower than the production build; judge speed on port 4173.

## Manual checklist

Tick each at a phone width (~390px) and a desktop width (~1366px).

1. **Layout:** no sideways scrolling; the first product card appears within about half a screen of scrolling on the phone; one scrolling row of category chips.
2. **Sticky controls:** scroll far down. Search and categories stay (desktop: header too); nothing covers the product you are looking at. At 200% zoom or in landscape the page switches to normal scrolling.
3. **Sheet edits (needs access to the sheet):** change a price, set one Stock to FALSE, set one Show on website to NO, add a product with a brand-new category. Press Refresh: price changes, "Out of stock" appears with no Add button, the product disappears, the new chip appears. Restore your edits afterwards.
4. **Search, filter, sort:** search a product name and a category; "Clear filters" works; every sort option reorders.
5. **Dialogs:** Details opens; Escape closes it and focus returns to the card; gallery thumbnails switch photos; pieces per pack and shots show only when the sheet has them.
6. **Cart:** add items; − and +; type a quantity (try 0, 100, a letter); Remove then **Undo removal**; **Clear cart** asks to confirm; refresh and the cart is restored.
7. **Coupons:** with an enabled coupon in the sheet, type it in the cart in lower case with spaces; try an unknown and a disabled code; check the min/max boundaries and that only one offer applies.
8. **Failure handling:** switch the network off, then press Refresh: the products stay with a "couldn't check" banner. In checkout, "Continue to WhatsApp" must not prepare anything and must keep the cart and form.
9. **Changes before sending:** with the cart open, change a price in the sheet, then press Continue to WhatsApp: a "Your order changed" list appears and nothing is sent until you accept.
10. **Review and dry run:** every item with ID, quantity, price, discount, charge, buyer and fulfilment is listed; "View the complete WhatsApp message" shows the full text; the demo shows "nothing was sent". For the long-order path add about 25 products: Copy or Download is required first.
11. **Image fallbacks:** a product with no image link shows "Product image coming soon"; a screenshot link not yet saved shows a "View photo" link.
12. **Sound, fireworks and reduced motion:** the firecrackers play when the page opens (browsers that block that play them on your first tap); the header button mutes them and the choice is remembered. Add to cart and the WhatsApp step each play the fireworks over the page, including over the cart; "reduce motion" stops those and the diya animation.
13. **Coupon list:** in the cart, "View coupon codes" lists the enabled codes under the Coupon code box; "Use" fills it. The offers strip link reads "View offers".

## Known limitations

- The demo handoff is a dry run: real WhatsApp opening, the Android/iOS app switch and delivery of a message are **not** tested by it.
- Sample fulfilment methods say nothing about what the seller actually offers.
- Screen readers, Firefox and Safari were not tested.
