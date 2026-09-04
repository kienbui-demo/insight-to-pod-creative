import type { ApifyActorEntry } from "../apify-crawl-port";

export const AMAZON_DETAIL_ACTOR_SLUG = "junglee/Amazon-crawler";

const RATING_LOG_CEILING = 6;

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

export function createAmazonDetailEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: AMAZON_DETAIL_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      categoryOrProductUrls: [
        {
          url: `https://www.amazon.com/s?k=${encodeURIComponent(input.seed)}`,
        },
      ],
      locationDeliverableRoutes: ["PRODUCT", "SEARCH", "OFFERS"],
      maxItemsPerStartUrl: input.limit ?? 5,
      maxOffers: 0,
      maxProductVariantsAsSeparateResults: 0,
      maxSearchPagesPerStartUrl: 9999,
      proxyCountry: "AUTO_SELECT_PROXY_COUNTRY",
      scrapeProductDetails: true,
      scrapeProductVariantPrices: false,
      scrapeSellers: false,
      useCaptchaSolver: false,
    }),
    normalize: (items, input) => {
      const products = items.filter(isPlainObject).map((item) => ({
        asin: typeof item.asin === "string" ? item.asin : undefined,
        title:
          typeof item.productTitle === "string"
            ? item.productTitle
            : undefined,
        price: finiteNumber(item.priceValue),
        starRating: finiteNumber(item.productStarRating),
        numRatings: finiteNumber(item.productNumRatings),
        isBestSeller: item.isBestSeller === true,
        isAmazonChoice: item.isAmazonChoice === true,
        isSponsored: item.isSponsored === true,
        domain:
          typeof item.domain === "string" ? item.domain : undefined,
        url:
          typeof item.productUrl === "string"
            ? item.productUrl
            : undefined,
      }));
      const resultCount = products.length;

      if (resultCount === 0) {
        return [];
      }

      const prices = products
        .map((product) => product.price)
        .filter((price): price is number => price !== undefined);
      const stars = products
        .map((product) => product.starRating)
        .filter((star): star is number => star !== undefined);
      const totalRatings = products.reduce(
        (sum, product) => sum + (product.numRatings ?? 0),
        0,
      );
      const bestSellerCount = products.filter(
        (product) => product.isBestSeller,
      ).length;
      const amazonChoiceCount = products.filter(
        (product) => product.isAmazonChoice,
      ).length;
      const sponsoredCount = products.filter(
        (product) => product.isSponsored,
      ).length;
      const avgPrice =
        prices.length > 0
          ? prices.reduce((sum, price) => sum + price, 0) / prices.length
          : 0;
      const avgStar =
        stars.length > 0
          ? stars.reduce((sum, star) => sum + star, 0) / stars.length
          : 0;
      const saturationScore = clamp01(
        Math.log10(totalRatings + 1) / RATING_LOG_CEILING,
      );
      const sponsoredShare = clamp01(
        resultCount > 0 ? sponsoredCount / resultCount : 0,
      );
      const normalizedValue = clamp01(
        0.7 * saturationScore + 0.3 * sponsoredShare,
      );

      return [
        {
          source: "amazon",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "competition",
          payload: {
            resultCount,
            avgPrice,
            avgStar,
            totalRatings,
            bestSellerCount,
            amazonChoiceCount,
            sponsoredCount,
            saturationScore,
            sponsoredShare,
            products,
            normalizedValue,
          },
        },
      ];
    },
  };
}
