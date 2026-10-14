export type Product = {
  id: string;
  sourceRowNumber: number;
  sourceNumber: number;
  name: string;
  originalCategory: string;
  categoryId: string;
  categoryLabel: string;
  variantLabel: string | null;
  pricePaise: number | null;
  sellingUnit: string | null;
  packDetails: string | null;
  images: string[];
  sourceImageLinks: string[];
  availability: string;
  stockQuantity: number | null;
  maxQuantityPerRequest: number;
  verifiedSpecifications: string[];
  certificationDetails: string | null;
  enabled: boolean;
  categoryReviewed: boolean;
  displayOrder: number;
  importIssues: string[];
};
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
  offers?: {
    labels: string[];
    tiers: {
      maxSubtotalPaise: number | null;
      basisPoints: number;
      couponCode?: string | null;
    }[];
  };
  brand: string;
  whatsapp: string;
  phoneDisplay: string;
  address: string | null;
  hours: string | null;
  catalogueVersion: string;
  orderingEnabled: boolean;
  publicCatalogueVerified: boolean;
  verification: Record<string, boolean>;
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
  acknowledged: false,
};
