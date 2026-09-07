import { describe, expect, it } from "vitest";

import type { CanonicalRecord } from "../../../../packages/contracts";
import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/amazon-search.dataset.json";
import {
  AMAZON_SEARCH_ACTOR_SLUG,
  createAmazonSearchEntry,
} from "../amazon-search";

const FIXED_NOW = "2026-09-04T12:34:56.000Z";
const INPUT: CrawlPortInput = {
  source: "amazon",
  market: "US",
  seed: "wireless mouse",
};

function productsFrom(record: CanonicalRecord): readonly unknown[] {
  const products = record.payload.products;
  expect(Array.isArray(products)).toBe(true);
  if (!Array.isArray(products)) {
    throw new Error("expected normalized products array");
  }
  return products;
}

describe("createAmazonSearchEntry", () => {
  it("builds the exact verified Amazon actor input", () => {
    const entry = createAmazonSearchEntry();

    expect(AMAZON_SEARCH_ACTOR_SLUG).toBe(
      "crawloop/amazon-search-scraper",
    );
    expect(entry.actorSlug).toBe(AMAZON_SEARCH_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      query: "wireless mouse",
      deduplicateAsins: true,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    });
  });

  it("normalizes the real fixture into one aggregated demand record", () => {
    const entry = createAmazonSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "amazon",
      market: "US",
      seed: "wireless mouse",
      capturedAt: FIXED_NOW,
      signalType: "demand",
      payload: {
        resultCount: fixture.length,
        sponsoredCount: 1,
        primeCount: 4,
        avgStarRating: 4.45,
        totalNumRatings: 1382,
      },
    });
    expect(productsFrom(records[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          asin: "B004YAVF8I",
          price: 13.97,
          starRating: 4.4,
          numRatings: 448,
          url: "https://www.amazon.com/Logitech-Wireless-Mouse-M185-Swift/dp/B004YAVF8I/ref=sr_1_3",
        }),
      ]),
    );
  });

  it("parses formatted prices and rejects empty or unparseable prices", () => {
    const entry = createAmazonSearchEntry({ now: () => FIXED_NOW });
    const [record] = entry.normalize(
      [
        { productPrice: "$1,299.00" },
        { productPrice: "" },
        { productPrice: "N/A" },
      ],
      INPUT,
    );

    expect(productsFrom(record)).toEqual([
      expect.objectContaining({ price: 1299, priceRaw: "$1,299.00" }),
      expect.objectContaining({ price: undefined, priceRaw: "" }),
      expect.objectContaining({ price: undefined, priceRaw: "N/A" }),
    ]);
  });

  it("ignores malformed non-object items without throwing", () => {
    const entry = createAmazonSearchEntry({ now: () => FIXED_NOW });

    const [record] = entry.normalize(
      [null, "malformed", 42, [], { asin: "VALID-ASIN" }],
      INPUT,
    );

    expect(record.payload.resultCount).toBe(1);
    expect(productsFrom(record)).toEqual([
      expect.objectContaining({ asin: "VALID-ASIN" }),
    ]);
  });
});
