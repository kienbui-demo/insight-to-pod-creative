import type {
  CanonicalRecord,
  CrawlSource,
  TrendCard,
} from "../../packages/contracts";
import type { CrawlPortResult } from "./ports";

const SIGNAL_TYPE_BY_SOURCE = {
  google_trends: "culture",
  reddit: "culture",
  pinterest: "culture",
  tiktok: "culture",
  amazon: "competition",
  etsy: "price",
  meta_ads: "ad",
} as const satisfies Record<CrawlSource, CanonicalRecord["signalType"]>;

function sourceSlice(
  card: TrendCard,
  source: CrawlSource,
): Record<string, unknown> {
  switch (source) {
    case "google_trends":
    case "reddit":
      return {
        trendSeries: card.trendSeries.map((point) => ({ ...point })),
      };
    case "pinterest":
    case "tiktok":
      return {
        trendSeries: card.trendSeries.map((point) => ({ ...point })),
        referenceImages: [...card.referenceImages],
      };
    case "amazon":
    case "etsy":
    case "meta_ads":
      return {
        competitors: (card.competitors ?? []).map((competitor) => ({
          ...competitor,
        })),
      };
  }
}

export function warehouseCrawlRecords(
  card: TrendCard,
  source: CrawlSource,
): CrawlPortResult {
  if (!card.availableSources.includes(source)) {
    return { ok: true, records: [] };
  }

  const record: CanonicalRecord = {
    source,
    market: card.market,
    seed: card.seed,
    capturedAt: card.updatedAt,
    signalType: SIGNAL_TYPE_BY_SOURCE[source],
    payload: {
      fromWarehouse: true,
      opportunityScore: card.opportunityScore,
      confidence: card.confidence,
      freshnessTier: card.freshnessTier,
      recommendation: { ...card.recommendation },
      ...sourceSlice(card, source),
    },
  };

  return { ok: true, records: [record] };
}
