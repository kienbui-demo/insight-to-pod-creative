import type { CrawlSource, TrendCard } from "../../../packages/contracts";

const AVAILABLE_SOURCES: CrawlSource[] = [
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
];

function trendCard(overrides: Partial<TrendCard>): TrendCard {
  return {
    id: "card-base",
    market: "US",
    seed: "retro halloween cat",
    productType: "t-shirt",
    opportunityScore: 82,
    confidence: 0.91,
    availableSources: [...AVAILABLE_SOURCES],
    missingSources: [],
    trendSeries: [{ t: "2026-08-25", v: 72 }],
    referenceImages: ["tos://trend-cards/retro-halloween-cat.png"],
    recommendation: {
      action: "Test a small seasonal collection",
      reasoning: "Demand is accelerating before the seasonal peak.",
    },
    freshnessTier: "hot",
    updatedAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

export const EXACT_TREND_CARD = trendCard({
  id: "card-exact",
  seed: "retro halloween cat",
});

export const SEMANTIC_TREND_CARD = trendCard({
  id: "card-semantic",
  seed: "vintage halloween cats",
});

export const MA_TREND_CARD = trendCard({
  id: "card-ma-live",
  seed: "quantum computing graduation",
  opportunityScore: 64,
  confidence: 0.73,
});
