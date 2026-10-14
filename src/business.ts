import source from "./products.json";
import type { Business, Product } from "./model";

// Business verification is evidence-based. Never switch these on solely to expose controls.
export const business: Business = {
  brand: "Diwali Collection",
  whatsapp: "919992230740",
  phoneDisplay: "+91 99922 30740",
  address: null,
  hours: null,
  catalogueVersion: source.version,
  orderingEnabled: false,
  publicCatalogueVerified: false,
  verification: {
    location: false,
    licences: false,
    onlineOrdering: false,
    permittedProducts: false,
    certification: false,
    serviceAreas: false,
    saleDates: false,
    hostApproval: false,
    policies: false,
    taxTreatment: false,
  },
  fulfilment: [],
  maxQuantity: 99,
  urlThreshold: 1800,
  tax: null,
  policies: {
    privacy: null,
    cancellation: null,
    safety: null,
    fulfilment: null,
  },
  soundVolume: 0.09,
  seo: {
    title: "Diwali Collection · Catalogue preview",
    description:
      "Explore the Diwali crackers catalogue. Selling units and availability require confirmation.",
    canonical: null,
    ogImage: null,
  },
};
export const isLocalDemo =
  import.meta.env.MODE === "demo" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
export const config: Business = isLocalDemo
  ? {
      ...business,
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
