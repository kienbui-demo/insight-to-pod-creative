import type { TrendCard } from "../../../packages/contracts";

export const TREND_CARDS = [
  {
    id: "trend-retro-halloween-cats",
    market: "US",
    seed: "retro halloween cats",
    productType: "t-shirt",
    opportunityScore: 84,
    confidence: 0.91,
    availableSources: ["google_trends", "reddit", "amazon", "etsy", "meta_ads"],
    missingSources: ["tiktok"],
    trendSeries: [
      { t: "2026-08-06", v: 38 },
      { t: "2026-08-13", v: 52 },
      { t: "2026-08-20", v: 67 },
      { t: "2026-08-27", v: 84 },
    ],
    referenceImages: ["https://tos.example/retro-halloween-cats.png"],
    competitors: [
      { title: "Retro Halloween Cat Shirt", price: 24.99, adActive: true },
      { title: "Spooky Cat Club Tee", price: 21.5, adActive: false },
    ],
    recommendation: {
      action: "Launch a vintage cat graphic before the October demand peak.",
      reasoning: "Search growth is accelerating while active-ad competition remains moderate.",
    },
    freshnessTier: "hot",
    updatedAt: "2026-08-28T02:00:00.000Z",
  },
  {
    id: "trend-coastal-grandma-christmas",
    market: "US",
    seed: "coastal grandma christmas",
    productType: "mug",
    opportunityScore: 76,
    confidence: 0.86,
    availableSources: ["google_trends", "pinterest", "amazon", "etsy", "meta_ads"],
    missingSources: ["tiktok", "reddit"],
    trendSeries: [
      { t: "2026-08-06", v: 31 },
      { t: "2026-08-13", v: 45 },
      { t: "2026-08-20", v: 59 },
      { t: "2026-08-27", v: 73 },
    ],
    referenceImages: ["https://tos.example/coastal-christmas.png"],
    recommendation: {
      action: "Test understated nautical holiday artwork on giftable products.",
      reasoning: "Pinterest saves and marketplace demand are rising ahead of seasonal listings.",
    },
    freshnessTier: "hot",
    updatedAt: "2026-08-27T18:00:00.000Z",
  },
  {
    id: "trend-bookish-winter-club",
    market: "DE",
    seed: "bookish winter club",
    productType: "sweatshirt",
    opportunityScore: 69,
    confidence: 0.78,
    availableSources: ["google_trends", "reddit", "pinterest", "etsy"],
    missingSources: ["tiktok", "amazon", "meta_ads"],
    trendSeries: [
      { t: "2026-08-06", v: 42 },
      { t: "2026-08-13", v: 46 },
      { t: "2026-08-20", v: 55 },
      { t: "2026-08-27", v: 64 },
    ],
    referenceImages: ["https://tos.example/bookish-winter.png"],
    recommendation: {
      action: "Validate cozy reading-club typography with a small winter collection.",
      reasoning: "Culture signals are positive, but missing commerce and ads data lowers confidence.",
    },
    freshnessTier: "warm",
    updatedAt: "2026-08-26T10:00:00.000Z",
  },
] satisfies TrendCard[];

export function findTrendCard(id: string): TrendCard {
  return TREND_CARDS.find((card) => card.id === id) ?? TREND_CARDS[0];
}
