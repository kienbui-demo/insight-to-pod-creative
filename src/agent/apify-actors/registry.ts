import { createAmazonDetailEntry } from "./amazon-detail";
import { createAmazonSearchEntry } from "./amazon-search";
import { createEtsyDetailEntry } from "./etsy-detail";
import { createEtsySearchEntry } from "./etsy-search";
import { createGoogleTrendsSearchEntry } from "./google-trends-search";
import { createMetaAdsSearchEntry } from "./meta-ads-search";
import type { ApifyActorRegistry } from "./multi-actor-crawl-port";
import { createPinterestSearchEntry } from "./pinterest-search";
import { createRedditSearchEntry } from "./reddit-search";
import { createTikTokSearchEntry } from "./tiktok-search";

export function createApifyActorRegistry(options?: {
  now?: () => string;
}): ApifyActorRegistry {
  return {
    google_trends: [createGoogleTrendsSearchEntry(options)],
    reddit: [createRedditSearchEntry(options)],
    pinterest: [createPinterestSearchEntry(options)],
    tiktok: [createTikTokSearchEntry(options)],
    amazon: [
      createAmazonSearchEntry(options),
      createAmazonDetailEntry(options),
    ],
    etsy: [createEtsySearchEntry(options), createEtsyDetailEntry(options)],
    meta_ads: [createMetaAdsSearchEntry(options)],
  };
}
