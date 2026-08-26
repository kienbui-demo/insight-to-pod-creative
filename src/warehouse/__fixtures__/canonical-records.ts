import type {
  CanonicalRecord,
  CrawlSource,
} from "../../../packages/contracts";

/**
 * B4-local provisional payload convention.
 *
 * `normalizedValue` is already component-ready and in [0,1]. Real provider
 * normalization and formulas are deferred to Phase C. The other fields are
 * minimal pass-through inputs used only to assemble the v1 TrendCard.
 */
export interface ProvisionalWarehousePayload {
  normalizedValue?: unknown;
  trendSeries?: unknown;
  referenceImageUrls?: unknown;
  competitors?: unknown;
}

export const ALL_CRAWL_SOURCES: readonly CrawlSource[] = [
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
];

const CAPTURED_AT = "2026-08-26T12:00:00.000Z";

export function canonicalRecord(
  source: CrawlSource,
  signalType: CanonicalRecord["signalType"],
  payload: ProvisionalWarehousePayload,
  overrides: Partial<CanonicalRecord> = {},
): CanonicalRecord {
  return {
    source,
    market: "US",
    seed: "retro halloween cats",
    capturedAt: CAPTURED_AT,
    signalType,
    payload: { ...payload },
    ...overrides,
  };
}

export const GOOGLE_TREND_SERIES = [
  { t: "2026-08-01", v: 42 },
  { t: "2026-08-08", v: 58 },
  { t: "2026-08-15", v: 76 },
];

export const REFERENCE_IMAGE_URLS = [
  "https://tos.example/retro-cat-1.png",
  "https://tos.example/retro-cat-2.png",
];

export const COMPETITORS = [
  { title: "Vintage Black Cat Shirt", price: 21.99, adActive: true },
  { title: "Spooky Cat Tee", price: 18.5 },
];

export const RECORDS_BY_SOURCE: Readonly<
  Record<CrawlSource, CanonicalRecord[]>
> = {
  google_trends: [
    canonicalRecord("google_trends", "culture", {
      normalizedValue: 0.8,
      trendSeries: GOOGLE_TREND_SERIES,
    }),
  ],
  reddit: [
    canonicalRecord("reddit", "culture", { normalizedValue: 0.6 }),
  ],
  pinterest: [
    canonicalRecord("pinterest", "culture", {
      normalizedValue: 0.7,
      referenceImageUrls: [REFERENCE_IMAGE_URLS[0]],
    }),
  ],
  tiktok: [
    canonicalRecord("tiktok", "culture", {
      normalizedValue: 0.9,
      referenceImageUrls: [
        REFERENCE_IMAGE_URLS[1],
        REFERENCE_IMAGE_URLS[0],
      ],
    }),
  ],
  amazon: [
    canonicalRecord("amazon", "demand", {
      normalizedValue: 0.8,
      competitors: [COMPETITORS[0]],
    }),
    canonicalRecord("amazon", "competition", {
      normalizedValue: 0.6,
    }),
  ],
  etsy: [
    canonicalRecord("etsy", "demand", {
      normalizedValue: 0.6,
      competitors: [COMPETITORS[1]],
    }),
    canonicalRecord("etsy", "price", { normalizedValue: 0.8 }),
  ],
  meta_ads: [
    canonicalRecord("meta_ads", "ad", { normalizedValue: 0.75 }),
  ],
};

export const ALL_SOURCE_RECORDS: CanonicalRecord[] =
  ALL_CRAWL_SOURCES.flatMap((source) => RECORDS_BY_SOURCE[source]);
