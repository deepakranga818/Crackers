import type { Business } from "./model";
import checklist from "../source/verification.json";
import approval from "../source/publication-approval.json";

// Catalogue data (products, prices, stock, offers, shop name, WhatsApp number) is NOT here: it is
// read from the Google Sheet at runtime (src/sheet). This file holds only app behaviour and the
// launch/publication gates.

// "private-friends": an unlisted, noindex list for the owner and friends. Ordering works, but
// no licence, legal or hosting item is marked verified. A public launch needs audience "public"
// and every item in source/verification.json verified with a reference.
const privateAudience = approval.audience === "private-friends";

// Business verification is evidence-based. Flags come from source/verification.json and
// count as verified only with a recorded reference. Never switch these on solely to expose controls.
const verification = Object.fromEntries(
  Object.entries(checklist).map(([key, item]) => [
    key,
    item.verified === true && !!item.reference,
  ]),
);
export const business: Business = {
  address: null,
  hours: null,
  orderingEnabled: privateAudience,
  privateAudience,
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
  // Largest quantity of one product the quantity control accepts. The sheet's Stock flag is
  // availability only, so there is no per-product limit.
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
    title: "Diwali Crackers Catalogue",
    description:
      "Browse the Diwali crackers catalogue with prices and offers. Availability is confirmed by the seller.",
    canonical: null,
    ogImage: null,
  },
};
// `npm run demo`: hand-testing the whole checkout against the live sheet, with sample fulfilment
// methods (including delivery with PIN checks). It needs the Vite dev server AND
// `--mode checkout-demo`, and vite.config.ts refuses to build that mode, so no deployable build
// can contain it. Nothing is ever sent: the handoff is a dry run (see App.tsx). The private-list
// rules still apply.
export const isCheckoutDemo =
  import.meta.env.DEV && import.meta.env.MODE === "checkout-demo";
// Where `npm run preview` serves the production build, for the demo's "switch back" link.
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
  : business;

// One source for every sentence that depends on what a visitor can actually do now.
export function modeCopy(canOrder: boolean) {
  const banner = isCheckoutDemo
    ? "Dry run · WhatsApp is never opened · sample fulfilment methods"
    : canOrder
      ? config.privateAudience
        ? "For friends and family · seller confirms orders"
        : "Requests require seller confirmation"
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
        howTitle: "Browse now.",
        howIntro: "Ordering is currently unavailable.",
        steps: [
          ["Find a product", "Search by name or category."],
          ["Compare prices", "Prices are in rupees."],
          [
            "Check the details",
            "Open a product to see its pack and stock details.",
          ],
        ],
      };
}
