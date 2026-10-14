import source from "./products.json";
import type { Business, Product } from "./model";
import checklist from "../source/verification.json";
import approval from "../source/publication-approval.json";

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
  brand: "Diwali Collection",
  whatsapp: "919992230740",
  phoneDisplay: "+91 99922 30740",
  address: null,
  hours: null,
  catalogueVersion: source.version,
  offers: source.offers,
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
export const isLocalDemo =
  import.meta.env.MODE === "demo" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
export const config: Business = isLocalDemo
  ? {
      ...business,
      privateAudience: false,
      orderingEnabled: true,
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
  { id: "review", label: "Other / Needs Review" },
];
export const catalogueSource = source.source;
