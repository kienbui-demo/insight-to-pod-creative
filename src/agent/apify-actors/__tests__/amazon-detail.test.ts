import { describe, expect, it } from "vitest";

import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/amazon-detail.dataset.json";
import {
  AMAZON_DETAIL_ACTOR_SLUG,
  createAmazonDetailEntry,
} from "../amazon-detail";

const FIXED_NOW = "2026-09-04T12:34:56.000Z";
const INPUT: CrawlPortInput = {
  source: "amazon",
  market: "US",
  seed: "wireless mouse",
  limit: 5,
};

describe("createAmazonDetailEntry", () => {
  it("builds the exact Amazon detail actor input", () => {
    const entry = createAmazonDetailEntry();

    expect(AMAZON_DETAIL_ACTOR_SLUG).toBe("junglee/Amazon-crawler");
    expect(entry.actorSlug).toBe(AMAZON_DETAIL_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      categoryOrProductUrls: [
        { url: "https://www.amazon.com/s?k=wireless%20mouse" },
      ],
      locationDeliverableRoutes: ["PRODUCT", "SEARCH", "OFFERS"],
      maxItemsPerStartUrl: 5,
      maxOffers: 0,
      maxProductVariantsAsSeparateResults: 0,
      maxSearchPagesPerStartUrl: 9999,
      proxyCountry: "AUTO_SELECT_PROXY_COUNTRY",
      scrapeProductDetails: true,
      scrapeProductVariantPrices: false,
      scrapeSellers: false,
      useCaptchaSolver: false,
    });
  });

  it("normalizes the fixture into one aggregated competition record", () => {
    const entry = createAmazonDetailEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.source).toBe("amazon");
    expect(record.signalType).toBe("competition");
    expect(record.market).toBe("US");
    expect(record.seed).toBe("wireless mouse");
    expect(record.capturedAt).toBe(FIXED_NOW);
    expect(record.payload.resultCount).toBe(22);
    expect(record.payload.totalRatings).toBe(4800);
    expect(record.payload.bestSellerCount).toBe(3);
    expect(record.payload.amazonChoiceCount).toBe(1);
    expect(record.payload.sponsoredCount).toBe(6);
    expect(record.payload.avgPrice).toBeCloseTo(
      21.76318181818182,
      10,
    );
    expect(record.payload.avgStar).toBeCloseTo(
      4.468181818181819,
      10,
    );
    expect(record.payload.saturationScore).toBeCloseTo(
      0.6135552843281943,
      12,
    );
    expect(record.payload.sponsoredShare).toBeCloseTo(
      0.2727272727272727,
      12,
    );
    expect(record.payload.normalizedValue).toBeCloseTo(
      0.5113068808479178,
      12,
    );
    expect(record.payload.products).toHaveLength(22);
  });

  it("returns no record for an empty dataset", () => {
    const entry = createAmazonDetailEntry({ now: () => FIXED_NOW });

    expect(entry.normalize([], INPUT)).toEqual([]);
  });
});
