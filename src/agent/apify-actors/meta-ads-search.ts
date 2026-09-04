import type { ApifyActorEntry } from "../apify-crawl-port";

export const META_ADS_SEARCH_ACTOR_SLUG =
  "curious_coder/facebook-ads-library-scraper";

// 100,000 matched ads saturates the breadth score at 1.0.
const TOTAL_LOG_CEILING = 5;
// Six months of average activity saturates the longevity score at 1.0.
const LONGEVITY_CEILING_DAYS = 180;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function createMetaAdsSearchEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: META_ADS_SEARCH_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => {
      const searchUrl =
        "https://www.facebook.com/ads/library/" +
        `?active_status=active&ad_type=all&country=${input.market}` +
        `&q=${encodeURIComponent(input.seed)}` +
        "&search_type=keyword_unordered&media_type=all";

      return {
        count: input.limit ?? 100,
        scrapeAdDetails: false,
        "scrapePageAds.activeStatus": "all",
        "scrapePageAds.countryCode": "ALL",
        "scrapePageAds.sortBy": "impressions_desc",
        urls: [{ url: searchUrl }],
      };
    },
    normalize: (items, input) => {
      const validItems = items.filter(isPlainObject);
      const ads = validItems.map((item) => {
        const snapshot = isPlainObject(item.snapshot) ? item.snapshot : {};
        const body = isPlainObject(snapshot.body) ? snapshot.body : {};
        const startDate = finiteNumber(item.start_date);
        const endDate = finiteNumber(item.end_date);

        return {
          adArchiveId:
            typeof item.ad_archive_id === "string"
              ? item.ad_archive_id
              : undefined,
          pageId:
            typeof item.page_id === "string" ? item.page_id : undefined,
          pageName:
            typeof item.page_name === "string" ? item.page_name : undefined,
          isActive: item.is_active === true,
          startDate,
          endDate,
          activeDays:
            startDate !== undefined && endDate !== undefined
              ? (endDate - startDate) / 86_400
              : 0,
          adsCount: finiteNumber(item.ads_count),
          collationCount: finiteNumber(item.collation_count),
          publisherPlatform: Array.isArray(item.publisher_platform)
            ? item.publisher_platform.filter(
                (platform): platform is string => typeof platform === "string",
              )
            : [],
          ctaType:
            typeof snapshot.cta_type === "string"
              ? snapshot.cta_type
              : undefined,
          displayFormat:
            typeof snapshot.display_format === "string"
              ? snapshot.display_format
              : undefined,
          pageLikeCount: finiteNumber(snapshot.page_like_count),
          title:
            typeof snapshot.title === "string" ? snapshot.title : undefined,
          caption:
            typeof snapshot.caption === "string"
              ? snapshot.caption
              : undefined,
          linkUrl:
            typeof snapshot.link_url === "string"
              ? snapshot.link_url
              : undefined,
          bodyText: typeof body.text === "string" ? body.text : undefined,
          adLibraryUrl:
            typeof item.ad_library_url === "string"
              ? item.ad_library_url
              : undefined,
        };
      });
      let totalMatchedAds = 0;
      for (const item of validItems) {
        const total = finiteNumber(item.total);
        if (total !== undefined) {
          totalMatchedAds = total;
          break;
        }
      }
      const advertiserKeys = ads
        .map((ad) => ad.pageId ?? ad.pageName)
        .filter((key): key is string => key !== undefined);
      const totalActiveDays = ads.reduce(
        (sum, ad) => sum + ad.activeDays,
        0,
      );
      const avgActiveDays =
        ads.length > 0 ? totalActiveDays / ads.length : 0;
      const breadthScore = clamp01(
        Math.log10(totalMatchedAds + 1) / TOTAL_LOG_CEILING,
      );
      const longevityScore = clamp01(
        avgActiveDays / LONGEVITY_CEILING_DAYS,
      );
      const normalizedValue = clamp01(
        0.5 * breadthScore + 0.5 * longevityScore,
      );

      return [
        {
          source: "meta_ads",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "ad",
          payload: {
            resultCount: ads.length,
            totalMatchedAds,
            distinctAdvertisers: new Set(advertiserKeys).size,
            avgActiveDays,
            breadthScore,
            longevityScore,
            ads,
            normalizedValue,
          },
        },
      ];
    },
  };
}
