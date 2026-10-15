import source from "./products.json";
import type { Business, Product } from "./model";
import checklist from "../source/verification.json";
import approval from "../source/publication-approval.json";

// "private-friends": an unlisted, noindex list for the owner and friends. Ordering works, but
// no licence, legal or hosting item is marked verified. A public launch needs audience "public"
// and every item in source/verification.json verified with a reference.
const privateAudience = approval.audience === "private-friends";
// MRP, "% off" and savings stay hidden until the owner confirms the Sheet's MRP values are
// genuine reference prices and a confirmation reference is recorded.
const referencePricesConfirmed =
  approval.referencePrices.confirmed === true &&
  !!approval.referencePrices.reference;

// Business verification is evidence-based. Flags come from source/verification.json and
// count as verified only with a recorded reference. Never switch these on solely to expose controls.
const verification = Object.fromEntries(
  Object.entries(checklist).map(([key, item]) => [
    key,
    item.verified === true && !!item.reference,
  ]),
);
export const business: Business = {
  brand: "Diwali Collection",
  whatsapp: "919992230740",
  phoneDisplay: "+91 99922 30740",
  address: null,
  hours: null,
  catalogueVersion: source.version,
  offers: source.offers,
  orderingEnabled: privateAudience,
  privateAudience,
  showReferencePrices: referencePricesConfirmed,
  publicCatalogueVerified: false,
  verification,
  fulfilment: privateAudience
    ? [
        {
          id: "whatsapp",
          label: "Pickup or delivery arranged on WhatsApp",
          type: "pickup",
          verified: true,
          chargePaise: null,
          servicePins: [],
        },
      ]
    : [],
  maxQuantity: 99,
  urlThreshold: 4000,
  tax: null,
  policies: {
    privacy: null,
    cancellation: null,
    safety: null,
    fulfilment: privateAudience
      ? "Pickup or delivery, and any charge, are arranged with the seller on WhatsApp after you send your order."
      : null,
  },
  soundVolume: 0.09,
  seo: {
    title: "Diwali Collection · Diwali Crackers Catalogue",
    description:
      "Browse the Diwali crackers catalogue with prices and offers. Selling units and availability are confirmed by the seller.",
    canonical: null,
    ogImage: null,
  },
};
// Local-only fixture for testing the ordering-enabled flow. It needs demo mode and a
// localhost hostname, so a deployed site can never switch ordering on through it.
// Read lazily: unit tests run without a window.
const onLocalHost = () =>
  ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
export const isLocalDemo = import.meta.env.MODE === "demo" && onLocalHost();
// `vite --mode private-fixture` serves test-only product data with fake confirmed units
// (see vite.config.ts). It is flagged on screen so it cannot be mistaken for the real list.
export const isFixture =
  import.meta.env.MODE === "private-fixture" && onLocalHost();
// `npm run demo`: sample products (demo/make-demo-data.mjs) and sample fulfilment, for hand-testing
// the whole checkout. It needs the Vite dev server AND `--mode checkout-demo`, and vite.config.ts
// refuses to build that mode, so no deployable build can contain it. It is deliberately not tied
// to localhost: a phone on the same network reaches the dev server by its LAN address. Nothing is
// ever sent: the handoff is a dry run (see App.tsx). The private-list rules still apply, so
// products without a unit or with an unreviewed type stay blocked.
export const isCheckoutDemo =
  import.meta.env.DEV && import.meta.env.MODE === "checkout-demo";
// Where `npm run preview` serves the actual catalogue, for the demo's "switch back" link.
export const actualCatalogueUrl = () =>
  `${window.location.protocol}//${window.location.hostname}:4173/`;
export const config: Business = isCheckoutDemo
  ? {
      ...business,
      orderingEnabled: true,
      privateAudience: true,
      fulfilment: [
        {
          id: "sample-pickup",
          label: "Sample pickup (test data)",
          type: "pickup",
          verified: true,
          address: "Sample pickup point — test data, not a real location",
          chargePaise: 0,
          servicePins: [],
        },
        {
          id: "sample-delivery",
          label: "Sample delivery, ₹50 charge (test data)",
          type: "delivery",
          verified: true,
          chargePaise: 5000,
          servicePins: ["110001", "560001"],
        },
        {
          id: "sample-delivery-tbc",
          label: "Sample delivery, charge confirmed by seller (test data)",
          type: "delivery",
          verified: true,
          chargePaise: null,
          servicePins: ["110001", "560001"],
        },
      ],
    }
  : isLocalDemo
  ? {
      ...business,
      privateAudience: false,
      orderingEnabled: true,
      showReferencePrices: true,
      publicCatalogueVerified: true,
      address: "Local test fixture — no real pickup location",
      verification: Object.fromEntries(
        Object.keys(business.verification).map((k) => [k, true]),
      ),
      fulfilment: [
        {
          id: "demo-pickup",
          label: "Demo pickup (test only)",
          type: "pickup",
          verified: true,
          address: "Local test fixture — no real pickup location",
          chargePaise: 0,
          servicePins: [],
        },
      ],
    }
  : business;
export const products: Product[] = source.products.map((p) =>
  isLocalDemo
    ? {
        ...p,
        sellingUnit: "Demo unit (not seller confirmed)",
        availability: "available",
        categoryReviewed: true,
      }
    : p,
);
export const categories = [
  { id: "all", label: "All Crackers" },
  { id: "sparklers", label: "Sparklers / Phuljadi" },
  { id: "spinners", label: "Ground Spinners / Chakkar" },
  { id: "pots", label: "Flower Pots / Anar" },
  { id: "rockets", label: "Rockets" },
  { id: "shots", label: "Sky Shots" },
  { id: "sound", label: "Sound Crackers / Bombs" },
  { id: "strings", label: "Strings / Laddi" },
  { id: "pop", label: "Pop-ups" },
  // Shopper wording. The id, original category and review flag keep the internal meaning.
  { id: "review", label: "More products" },
];
export const catalogueSource = source.source;

// One source for every sentence that depends on what a visitor can actually do now.
// `canOrder` means at least one product can really be ordered (see anyOrderable).
export function modeCopy(canOrder: boolean) {
  const banner = isCheckoutDemo
    ? "Dry run · WhatsApp is never opened · sample units, availability and fulfilment"
    : isLocalDemo
    ? "Local demo · test units and pickup only · do not send a real request"
    : isFixture
      ? "Test fixture · units are not seller confirmed · do not send a real request"
      : canOrder
        ? config.privateAudience
          ? "For friends and family · seller confirms orders"
          : "Requests require seller confirmation"
        : config.orderingEnabled
          ? "Browsing only until selling units are confirmed"
          : "Catalogue preview · ordering is currently unavailable";
  return canOrder
    ? {
        banner,
        hero: "Pick your crackers, check the offers and send your selection to the seller on WhatsApp.",
        howTitle: "Your selection. Seller confirmation.",
        howIntro:
          "No online payment or account required. A request becomes an order only after the seller confirms it.",
        steps: [
          ["Choose your favourites", "Browse categories and compare prices."],
          [
            "Review your request",
            "Check your items and offer, then enter your name and mobile number.",
          ],
          [
            "Send on WhatsApp",
            "WhatsApp opens with your request. Tap Send; the seller confirms availability, fulfilment and the final amount.",
          ],
        ],
      }
    : {
        banner,
        hero: "Browse the crackers and compare prices.",
        howTitle: "Browse now. Order once details are confirmed.",
        howIntro:
          "Ordering is unavailable until the seller confirms what each price covers.",
        steps: [
          [
            "Find a product",
            "Search by name, or by common names like Phuljadi and Anar.",
          ],
          ["Compare prices", "Prices are in rupees; offers apply automatically."],
          [
            "Check the details",
            "Open a product to see its type, pack information and whether its selling unit is confirmed.",
          ],
        ],
      };
}
