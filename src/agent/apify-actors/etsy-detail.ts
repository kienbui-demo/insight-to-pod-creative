import type { ApifyActorEntry } from "../apify-crawl-port";

export const ETSY_DETAIL_ACTOR_SLUG = "usestring/etsy-listings";

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

export function createEtsyDetailEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: ETSY_DETAIL_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      maxItems: input.limit ?? 5,
      searches: [input.seed],
    }),
    normalize: (items, input) => {
      const listings = items.filter(isPlainObject).map((item) => ({
        listingId:
          typeof item.listingId === "string" ? item.listingId : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
        price: finiteNumber(item.price),
        currency:
          typeof item.currency === "string" ? item.currency : undefined,
        shopRating: finiteNumber(item.shopRating),
        shopReviewCount: finiteNumber(item.shopReviewCount),
        shopName:
          typeof item.shopName === "string" ? item.shopName : undefined,
        isBestseller: item.isBestseller === true,
        freeShipping: item.freeShipping === true,
        url:
          typeof item.listingUrl === "string" ? item.listingUrl : undefined,
      }));
      const resultCount = listings.length;

      if (resultCount === 0) {
        return [];
      }

      const prices = listings
        .map((listing) => listing.price)
        .filter((price): price is number => price !== undefined);
      const sortedPrices = [...prices].sort((a, b) => a - b);
      const minPrice = sortedPrices.length > 0 ? sortedPrices[0] : 0;
      const maxPrice =
        sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : 0;
      const avgPrice =
        prices.length > 0
          ? prices.reduce((sum, price) => sum + price, 0) / prices.length
          : 0;
      const medianPrice =
        sortedPrices.length > 0
          ? sortedPrices.length % 2 === 1
            ? sortedPrices[(sortedPrices.length - 1) / 2]
            : (sortedPrices[sortedPrices.length / 2 - 1] +
                sortedPrices[sortedPrices.length / 2]) /
              2
          : 0;
      const freeShipCount = listings.filter(
        (listing) => listing.freeShipping,
      ).length;
      const bestsellerCount = listings.filter(
        (listing) => listing.isBestseller,
      ).length;
      const freeShipShare = clamp01(
        resultCount > 0 ? freeShipCount / resultCount : 0,
      );
      const priceSpread = clamp01(
        maxPrice > 0 ? (maxPrice - minPrice) / maxPrice : 0,
      );
      const normalizedValue = priceSpread;

      return [
        {
          source: "etsy",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "price",
          payload: {
            resultCount,
            minPrice,
            maxPrice,
            avgPrice,
            medianPrice,
            freeShipCount,
            bestsellerCount,
            freeShipShare,
            priceSpread,
            listings,
            normalizedValue,
          },
        },
      ];
    },
  };
}
