# Launch checklist — unresolved owner inputs

As of 15 October 2026 this is a friends-and-family catalogue. Products, prices, stock, offers, the shop name and the WhatsApp number come live from the Google Sheet; nothing about them is decided in code. The page is reachable by anyone with the URL (it is not access-controlled), and `noindex`/`robots.txt` only ask search engines not to list it.

Before any publication, record a location-specific legal review of **public catalogue display**, host permission, content and products. Before ordering, independently verify whether this kind of online request is lawful. WhatsApp, pickup, an age acknowledgement, or calling a transaction an enquiry does not make it permissible.

Owner inputs required:

- Final shop/brand name, logo and preferred languages. The name now comes from `Shop name` in the sheet's SHOP SETTINGS (blank today: the site shows the neutral heading "Diwali crackers").
- **Whether the sheet's MRP column is a genuine reference price.** The site now shows a struck-through MRP for every product whose MRP is a number above its selling price. Every MRP in the sheet is exactly 1.4× the selling price, which looks formula-derived, and the sheet's own note says to verify them. Blank or correct the MRP column before sharing widely.
- Seller’s operating location, real shop address and business hours.
- Valid relevant seller licences; verify privately, do not commit scans.
- Current national, state, municipal and court restrictions, sale dates and online-ordering permissions.
- Permitted products and certification evidence for each product; no supplied product is claimed certified or green.
- Verify publication reuse rights for the locally saved screenshot photos (`public/images/`). Supply original photos for products with none (PRD-0045, PRD-0046 today); a direct image URL in the sheet shows without any rebuild.
- Tidy the **Category** column in the sheet: the site makes one chip per distinct category text (case and spacing aside) and never guesses merges, so near-duplicates such as "Phuljadi - Small" / "Phuljadi -Color" stay separate chips.
- Check the Strings/Laddi products (PRD-0023, PRD-0024 today) against restrictions on joined crackers; being listed in a source sheet does not establish permission to sell.
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

The site currently runs as a **friends-and-family list** (`"audience": "private-friends"` in `source/publication-approval.json`). That setting does not waive product data requirements: a product must be visible, have a valid price and Stock TRUE in the sheet to be ordered. What it relaxes is the public-launch verification list. It must keep `noindex`, but that is not access control. It is not a public launch, and sharing the link publicly would make it one.

## Fail-closed controls

Keep `orderingEnabled=false` while unresolved. Catalogue mode removes cart/add/buyer/handoff controls, and so does a friends-and-family list in which no product is orderable. For a public shop the orderability function also requires all verification flags, an address, a verified fulfilment method, and valid product data (visible, priced, in stock).

Netlify deployment additionally runs `scripts/check-publication.mjs`: its approval manifest is currently false, so public builds fail intentionally. Only record non-sensitive references to actual reviews, not assertions created to unblock deployment. This build check is an operational guard, not tamper-proof legal enforcement or a secure admin control.

If legal review determines online ordering is prohibited, keep this version catalogue-only where catalogue publication is independently allowed. Do not enable the request flow.
