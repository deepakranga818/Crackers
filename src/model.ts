// ---- Sheet data (everything below comes from the Google Sheet at runtime) ----
export type Product = {
  id: string; // Product ID: the only key for rendering and saved cart items
  name: string;
  category: string; // whitespace-normalised text as written; "" when blank
  categoryKey: string; // case-folded key used to group categories
  pricePaise: number | null; // null = missing/invalid, never treated as free
  mrpPaise: number | null;
  piecesPerPack: number | null; // pack contents
  shots: number | null; // firing count, independent of pieces
  inStock: boolean; // Stock TRUE/FALSE flag only; there is no quantity
  visible: boolean; // Show on website
  description: string | null;
  imageLinks: string[]; // safe https links, in sheet order
  displayOrder: number;
};
export type Offer = {
  name: string;
  mode: "coupon" | "automatic";
  code: string | null; // coupons only, as typed in the sheet
  type: "percent" | "fixed";
  value: number; // percent: basis points (10% = 1000); fixed: paise
  minPaise: number | null; // inclusive
  maxPaise: number | null; // inclusive
  enabled: boolean;
  row: number;
};
export type Settings = {
  shopName: string | null;
  whatsapp: string | null; // digits only, country code included
};
export type Snapshot = {
  version: string;
  products: Product[];
  offers: Offer[];
  settings: Settings;
};

// ---- App behaviour (code, not catalogue data) ----
export type Cart = Record<string, number>;
export type Fulfilment = {
  id: string;
  label: string;
  type: "pickup" | "delivery";
  verified: boolean;
  address?: string;
  chargePaise: number | null;
  servicePins: string[];
};
export type Business = {
  orderingEnabled: boolean;
  privateAudience?: boolean;
  publicCatalogueVerified: boolean;
  verification: Record<string, boolean>;
  address: string | null;
  hours: string | null;
  fulfilment: Fulfilment[];
  maxQuantity: number;
  urlThreshold: number;
  tax: { label: string; basisPoints: number; verified: boolean } | null;
  policies: {
    privacy: string | null;
    cancellation: string | null;
    safety: string | null;
    fulfilment: string | null;
  };
  soundVolume: number;
  seo: {
    title: string;
    description: string;
    canonical: string | null;
    ogImage: string | null;
  };
};
export type Buyer = {
  name: string;
  mobile: string;
  method: string;
  address: string;
  locality: string;
  city: string;
  state: string;
  pin: string;
  landmark: string;
  notes: string;
  acknowledged: boolean;
};
export const emptyBuyer: Buyer = {
  name: "",
  mobile: "",
  method: "",
  address: "",
  locality: "",
  city: "",
  state: "",
  pin: "",
  landmark: "",
  notes: "",
  // Ticked from the start (the notice is next to the button); the visitor can untick it.
  acknowledged: true,
};
