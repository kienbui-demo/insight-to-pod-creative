import type {
  CanonicalRecord,
  CrawlSource,
} from "../../packages/contracts";
import type { CrawlPort } from "./ports";

const SIGNAL_TYPE_BY_SOURCE: Record<
  CrawlSource,
  CanonicalRecord["signalType"]
> = {
  google_trends: "culture",
  reddit: "culture",
  pinterest: "culture",
  tiktok: "culture",
  amazon: "demand",
  etsy: "demand",
  meta_ads: "ad",
};

export const stubCrawlPort: CrawlPort = {
  async fetch(input) {
    return {
      ok: true,
      records: [
        {
          source: input.source,
          market: input.market,
          seed: input.seed,
          capturedAt: "2025-01-01T00:00:00.000Z",
          signalType: SIGNAL_TYPE_BY_SOURCE[input.source],
          payload: { stub: true, transport: "offline" },
        },
      ],
    };
  },
};
