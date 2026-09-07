import type { ApifyActorEntry } from "../apify-crawl-port";

export const ETSY_SEARCH_ACTOR_SLUG = "scrapers_lat/etsy-scraper";

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

export function createEtsySearchEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: ETSY_SEARCH_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      searchQuery: input.seed,
      maxResults: input.limit ?? 10,
      aiListingSummary: false,
      shopDetails: false,
    }),
    normalize: (items, input) => {
      const products = items.filter(isPlainObject).map((item) => ({
        title:
          typeof item.listingTitle === "string"
            ? item.listingTitle
            : undefined,
        price: finiteNumber(item.price),
        salePrice: finiteNumber(item.salePrice),
        currency:
          typeof item.currency === "string" ? item.currency : undefined,
        rating: finiteNumber(item.rating),
        reviewCount: finiteNumber(item.reviewCount),
        shopName:
          typeof item.shopName === "string" ? item.shopName : undefined,
        itemSales: finiteNumber(item.itemSales),
        url:
          typeof item.listingUrl === "string"
            ? item.listingUrl
            : undefined,
        image:
          typeof item.primaryImage === "string"
            ? item.primaryImage
            : undefined,
      }));
      const prices = products
        .map((product) => product.price)
        .filter((price): price is number => price !== undefined);
      const salePrices = products
        .map((product) => product.salePrice)
        .filter((price): price is number => price !== undefined);
      const shopNames = products
        .map((product) => product.shopName)
        .filter((shopName): shopName is string => shopName !== undefined);

      return [
        {
          source: "etsy",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "demand",
          payload: {
            resultCount: products.length,
            onSaleCount: products.filter(
              (product) => product.salePrice !== undefined,
            ).length,
            avgPrice:
              prices.length > 0
                ? prices.reduce((sum, price) => sum + price, 0) /
                  prices.length
                : undefined,
            avgSalePrice:
              salePrices.length > 0
                ? salePrices.reduce((sum, price) => sum + price, 0) /
                  salePrices.length
                : undefined,
            shopCount: new Set(shopNames).size,
            products,
          },
        },
      ];
    },
  };
}
