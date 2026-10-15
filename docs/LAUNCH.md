# Launch checklist — unresolved owner inputs

As of 15 October 2026 this is a friends-and-family catalogue. **No product has a confirmed selling unit, so none can be ordered: the site is browse-only until units are confirmed.** The page is reachable by anyone with the URL (it is not access-controlled), and `noindex`/`robots.txt` only ask search engines not to list it.

Before any publication, record a location-specific legal review of **public catalogue display**, host permission, content and products. Before ordering, independently verify whether this kind of online request is lawful. WhatsApp, pickup, an age acknowledgement, or calling a transaction an enquiry does not make it permissible.

Owner inputs required:

- Final shop/brand name, logo and preferred languages. The current name "Diwali Collection" is a placeholder set in `src/business.ts`; it is not shown as a development label on the site.
- **Selling unit for every product (the unlock for ordering).** Until a product has one, it cannot be added, restored into a cart or handed off to WhatsApp, even on the friends-and-family list. Fill `reports/selling-units-needed.csv`, then add the confirmed units to `source/product-overrides.json`. Nothing assigns "per item".
- **Whether the Sheet's MRP column is a genuine reference price.** Every MRP is exactly 1.4× the selling price (`node scripts/mrp-ratio.mjs`), which looks formula-derived. Struck-through MRP, "% off" and savings are hidden on the site until the owner confirms them and `referencePrices` in `source/publication-approval.json` records where.
- Seller’s operating location, real shop address and business hours.
- Valid relevant seller licences; verify privately, do not commit scans.
- Current national, state, municipal and court restrictions, sale dates and online-ordering permissions.
- Permitted products and certification evidence for each product; no supplied product is claimed certified or green.
- Confirmed selling unit (packet/box/piece) and pack quantity for every product to be orderable. Fill `reports/selling-units-needed.csv`, then add `"dc-001": {"sellingUnit": "Packet of 10", "availability": "available"}` style entries to `source/product-overrides.json`. Six rows carry pack text in the sheet ("5 piece", "10 piece", "3 Piece") that needs a per-box or per-piece answer. Nothing assumes a unit.
- Verify publication reuse rights for the 51 locally imported workbook-linked photos. Supply missing original photos for 60 Shot and 100 Shot, and better photos for the 14 images listed in `reports/image-quality.md` (very wide or tall strips and low-resolution shots that the card frame cannot improve), plus the multi-panel collages such as dc-001 and dc-002.
- Choose the category for ambiguous IDs dc-029, dc-030, dc-031 (sheet says "Anar Bomb"; box images read "SOUND CRACKER NEW", "SOUND AND LIGHT" and "Flower Bomb"), dc-037 (Fountain Rocket) and dc-038 (Single shot Rocket Flower). They stay under the shopper-facing category "More products" (internal id `review`) and cannot be ordered. dc-044 (Anar - Handhandle) is mapped to Flower Pots / Anar because the sheet text says Anar; evidence is in `source/category-map.json`.
- Check Strings/Laddi IDs dc-023 and dc-024 against restrictions on joined crackers; being listed in a source sheet does not establish permission to sell.
- Stock/availability policy; static carts do not reserve inventory.
- Verified pickup/delivery methods, actual pickup address, service-area PIN allowlist and permitted handling/transport. Delivery stays disabled without configured permitted options.
- Charges, tax treatment, payment arrangement after seller confirmation and cancellation/return policy.
- Seller-facing privacy notice, applicable handling/safety information and host approval.
- Final domain, SEO description/Open Graph image, canonical URL and sitemap. Remove noindex only for approved public environments.

## Legal evidence reviewed, not location clearance

[Supreme Court judgment, 23 October 2018, page 49](https://api.sci.gov.in/supremecourt/2015/32461/32461_2015_Judgement_23-Oct-2018.pdf) restricts online acceptance and sale through e-commerce sites, requires licensed traders and restricts joined crackers. [Supreme Court NCR order, 15 October 2025](https://www.api.sci.gov.in/supremecourt/1985/63998/63998_1985_1_1501_65037_FinalOrder_15-Oct-2025.pdf) also addresses e-commerce and joined crackers; its temporary 2025 conditions are not permission for 2026. [Supreme Court April 2025 order](https://api.sci.gov.in/supremecourt/1985/63998/63998_1985_4_9_60677_Order_03-Apr-2025.pdf) illustrates additional NCR restrictions. These sources establish a material launch blocker, not a complete current legal opinion for an unknown seller location. Recheck the latest applicable orders and local authority rules before publication or enablement.

## Verification checklist

`source/verification.json` is the single record of what still needs evidence. An item counts as verified only with `"verified": true` and a non-empty `reference`; the app and the deploy gate both read it. Groups:

- **business-config** (seller-supplied settings): `location`, `serviceAreas`, `policies`, `taxTreatment`.
- **licence**: `licences`.
- **legal**: `onlineOrdering`, `permittedProducts`, `saleDates`.
- **product-certification**: `certification`.
- **hosting**: `hostApproval`.

All ten are currently unverified. The owner's general instruction to build or host the site is not evidence for any of them.

The site currently runs as a **friends-and-family list** (`"audience": "private-friends"` in `source/publication-approval.json`). That setting does not waive product data or launch requirements: a product still needs a confirmed selling unit and a reviewed product type before it can be ordered. What it relaxes is the public-launch verification list, and availability: the seller confirms stock on WhatsApp for every order, so unknown availability does not block, while `unavailable` does. It must keep `noindex`, but that is not access control. It is not a public launch, and sharing the link publicly would make it one.

## Fail-closed controls

Keep `orderingEnabled=false` while unresolved. Catalogue mode removes cart/add/buyer/handoff controls, and so does a friends-and-family list in which no product is orderable. For a public shop the orderability function also requires all verification flags, an address, a verified fulfilment method, valid enabled product data, reviewed category, confirmed unit and available status.

Netlify deployment additionally runs `scripts/check-publication.mjs`: its approval manifest is currently false, so public builds fail intentionally. Only record non-sensitive references to actual reviews, not assertions created to unblock deployment. This build check is an operational guard, not tamper-proof legal enforcement or a secure admin control.

If legal review determines online ordering is prohibited, keep this version catalogue-only where catalogue publication is independently allowed. Do not enable the request flow.
