import type { ApifyActorEntry } from "../apify-crawl-port";

export const AMAZON_SEARCH_ACTOR_SLUG =
  "crawloop/amazon-search-scraper";

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

function parsePrice(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (normalized.length === 0) {
    return undefined;
  }

  return finiteNumber(Number(normalized));
}

export function createAmazonSearchEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: AMAZON_SEARCH_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      query: input.seed,
      deduplicateAsins: true,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    }),
    normalize: (items, input) => {
      const products = items.filter(isPlainObject).map((item) => {
        const priceRaw =
          typeof item.productPrice === "string"
            ? item.productPrice
            : undefined;

        return {
          asin: typeof item.asin === "string" ? item.asin : undefined,
          title:
            typeof item.productTitle === "string"
              ? item.productTitle
              : undefined,
          price: parsePrice(priceRaw),
          priceRaw,
          currency:
            typeof item.currency === "string" ? item.currency : undefined,
          starRating: finiteNumber(item.productStarRating),
          numRatings: finiteNumber(item.productNumRatings),
          isSponsored: item.isSponsored === true,
          isPrime: item.isPrime === true,
          position: finiteNumber(item.position),
          page: finiteNumber(item.page),
          url:
            typeof item.productUrl === "string"
              ? item.productUrl
              : undefined,
        };
      });
      const starRatings = products
        .map((product) => product.starRating)
        .filter((rating): rating is number => rating !== undefined);

      return [
        {
          source: "amazon",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "demand",
          payload: {
            resultCount: products.length,
            sponsoredCount: products.filter((product) => product.isSponsored)
              .length,
            primeCount: products.filter((product) => product.isPrime).length,
            avgStarRating:
              starRatings.length > 0
                ? starRatings.reduce((sum, rating) => sum + rating, 0) /
                  starRatings.length
                : undefined,
            totalNumRatings: products.reduce(
              (sum, product) => sum + (product.numRatings ?? 0),
              0,
            ),
            products,
          },
        },
      ];
    },
  };
}
