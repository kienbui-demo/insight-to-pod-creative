import type { CrawlSource, TrendCard } from "../../../packages/contracts";

export const ALL_CRAWL_SOURCES = [
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
] as const satisfies readonly CrawlSource[];

export const COMPLETE_TREND_CARD = {
  id: "trend-retro-halloween-cats",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  opportunityScore: 84,
  confidence: 0.91,
  availableSources: [...ALL_CRAWL_SOURCES],
  missingSources: [],
  trendSeries: [
    { t: "2026-08-13", v: 61 },
    { t: "2026-08-20", v: 72 },
    { t: "2026-08-27", v: 85 },
  ],
  referenceImages: ["https://tos.example/retro-halloween-cats/reference.png"],
  competitors: [
    { title: "Retro Halloween Cat Shirt", price: 24.99, adActive: true },
  ],
  recommendation: {
    action: "Create a retro Halloween cat design for the early seasonal window.",
    reasoning: "Demand is accelerating while active-ad competition remains moderate.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-08-28T02:00:00.000Z",
} satisfies TrendCard;

export const PARTIAL_CONFIDENCE_BY_SOURCE = {
  google_trends: 0.72,
  reddit: 0.72,
  pinterest: 0.72,
  tiktok: 0.72,
  amazon: 0.68,
  etsy: 0.68,
  meta_ads: 0.58,
} as const satisfies Readonly<Record<CrawlSource, number>>;

export function trendCardMissing(source: CrawlSource): TrendCard {
  return {
    ...COMPLETE_TREND_CARD,
    id: `${COMPLETE_TREND_CARD.id}-missing-${source}`,
    confidence: PARTIAL_CONFIDENCE_BY_SOURCE[source],
    availableSources: ALL_CRAWL_SOURCES.filter((candidate) => candidate !== source),
    missingSources: [source],
  };
}
