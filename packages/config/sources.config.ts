import type { CrawlSource } from "../contracts";

export interface SourceThreshold {
  readonly timeoutMs: number;
  readonly maxRequestsPerScan: number;
  readonly defaultLimit: number;
}

export type SourceThresholds = Readonly<Record<CrawlSource, SourceThreshold>>;

// TUNABLE: B1/B2 may adjust these operational and cost bounds through a reviewed config change.
export const SOURCE_THRESHOLDS: SourceThresholds = {
  google_trends: {
    timeoutMs: 8_000,
    maxRequestsPerScan: 1,
    defaultLimit: 50,
  },
  reddit: {
    timeoutMs: 8_000,
    maxRequestsPerScan: 1,
    defaultLimit: 100,
  },
  pinterest: {
    timeoutMs: 8_000,
    maxRequestsPerScan: 1,
    defaultLimit: 50,
  },
  tiktok: {
    timeoutMs: 15_000,
    maxRequestsPerScan: 1,
    defaultLimit: 25,
  },
  amazon: {
    timeoutMs: 15_000,
    maxRequestsPerScan: 1,
    defaultLimit: 25,
  },
  etsy: {
    timeoutMs: 10_000,
    maxRequestsPerScan: 1,
    defaultLimit: 50,
  },
  meta_ads: {
    timeoutMs: 15_000,
    maxRequestsPerScan: 1,
    defaultLimit: 25,
  },
};
