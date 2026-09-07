import { describe, expect, it } from "vitest";

import type { CanonicalRecord } from "../../../../packages/contracts";
import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/etsy-search.dataset.json";
import {
  createEtsySearchEntry,
  ETSY_SEARCH_ACTOR_SLUG,
} from "../etsy-search";

const FIXED_NOW = "2026-09-04T12:34:56.000Z";
const INPUT: CrawlPortInput = {
  source: "etsy",
  market: "US",
  seed: "leather wallet",
};

function productsFrom(record: CanonicalRecord): readonly unknown[] {
  const products = record.payload.products;
  expect(Array.isArray(products)).toBe(true);
  if (!Array.isArray(products)) {
    throw new Error("expected normalized products array");
  }
  return products;
}

describe("createEtsySearchEntry", () => {
  it("builds the exact verified Etsy actor input", () => {
    const entry = createEtsySearchEntry();

    expect(ETSY_SEARCH_ACTOR_SLUG).toBe("scrapers_lat/etsy-scraper");
    expect(entry.actorSlug).toBe(ETSY_SEARCH_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      searchQuery: "leather wallet",
      maxResults: 10,
      aiListingSummary: false,
      shopDetails: false,
    });
    expect(entry.buildInput({ ...INPUT, limit: 25 }).maxResults).toBe(25);
  });

  it("normalizes the real fixture into one aggregated demand record", () => {
    const entry = createEtsySearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "etsy",
      market: "US",
      seed: "leather wallet",
      capturedAt: FIXED_NOW,
      signalType: "demand",
      payload: {
        resultCount: 10,
        onSaleCount: 9,
        shopCount: 10,
      },
    });
    expect(records[0].payload.avgPrice).toBeCloseTo(86.374);
    expect(records[0].payload.avgSalePrice).toBeCloseTo(60.37);

    const products = productsFrom(records[0]);
    expect(products[0]).toMatchObject({
      title:
        "Personalized Leather Cash Wallet for Men, Full Grain Slim Front Pocket Card Holder, Handmade Minimalist Wallet, Gift for him",
      price: 69.99,
      salePrice: 37.79,
      currency: "USD",
      shopName: "AmericanLeatherGift",
      rating: undefined,
      reviewCount: undefined,
      itemSales: undefined,
      url: "https://www.etsy.com/listing/4461240474/leather-cash-wallet-slim-front-pocket",
      image:
        "https://i.etsystatic.com/41443453/r/il/b11a3f/7994642756/il_372x296.7994642756_ld98.jpg",
    });
    expect(products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shopName: "AmishLeatherWorks",
          price: 44.99,
          salePrice: undefined,
        }),
      ]),
    );
  });

  it("maps null numeric fields to undefined", () => {
    const entry = createEtsySearchEntry({ now: () => FIXED_NOW });
    const [record] = entry.normalize(
      [
        {
          price: 12.5,
          salePrice: null,
          rating: null,
          reviewCount: null,
          itemSales: null,
          shopName: "X",
        },
      ],
      INPUT,
    );

    expect(productsFrom(record)[0]).toMatchObject({
      price: 12.5,
      salePrice: undefined,
      rating: undefined,
      reviewCount: undefined,
      itemSales: undefined,
    });
    expect(record.payload.onSaleCount).toBe(0);
  });

  it("ignores malformed non-object items without throwing", () => {
    const entry = createEtsySearchEntry({ now: () => FIXED_NOW });

    const [record] = entry.normalize(
      [null, "x", 42, [], { listingTitle: "OK", shopName: "Solo" }],
      INPUT,
    );

    expect(record.payload.resultCount).toBe(1);
    expect(record.payload.shopCount).toBe(1);
  });
});
