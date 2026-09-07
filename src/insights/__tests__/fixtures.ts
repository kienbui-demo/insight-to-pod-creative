import type { TrendCard } from "../../../packages/contracts";

export const RETRO_HALLOWEEN_CATS_CARD: TrendCard = {
  id: "retro-halloween-cats-us",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  opportunityScore: 84,
  confidence: 0.91,
  availableSources: [
    "google_trends",
    "reddit",
    "amazon",
    "etsy",
    "meta_ads",
  ],
  missingSources: ["tiktok"],
  trendSeries: [
    { t: "2026-08-08", v: 20 },
    { t: "2026-08-15", v: 24 },
    { t: "2026-08-22", v: 30 },
    { t: "2026-08-29", v: 42 },
    { t: "2026-09-05", v: 55 },
  ],
  referenceImages: [],
  competitors: [
    { title: "Vintage Black Cat Tee", price: 19.99, adActive: true },
    { title: "Retro Halloween Cat Shirt", price: 24.99, adActive: true },
    { title: "Spooky Cat Graphic Tee", price: 34.99, adActive: false },
    { title: "Halloween Cat Sweatshirt", adActive: false },
  ],
  recommendation: {
    action: "Launch a focused three-design capsule",
    reasoning: "Lean into distressed orange typography and expressive black cats.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-09-06T00:00:00.000Z",
};
