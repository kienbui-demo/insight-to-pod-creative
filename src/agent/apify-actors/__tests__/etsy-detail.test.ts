import { describe, expect, it } from "vitest";

import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/etsy-detail.dataset.json";
import {
  ETSY_DETAIL_ACTOR_SLUG,
  createEtsyDetailEntry,
} from "../etsy-detail";

const FIXED_NOW = "2026-09-04T12:34:56.000Z";
const INPUT: CrawlPortInput = {
  source: "etsy",
  market: "US",
  seed: "handmade jewelry",
  limit: 5,
};

describe("createEtsyDetailEntry", () => {
  it("builds the exact Etsy detail actor input", () => {
    const entry = createEtsyDetailEntry();

    expect(ETSY_DETAIL_ACTOR_SLUG).toBe("usestring/etsy-listings");
    expect(entry.actorSlug).toBe(ETSY_DETAIL_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      maxItems: 5,
      searches: ["handmade jewelry"],
    });
  });

  it("normalizes the fixture into one aggregated price record", () => {
    const entry = createEtsyDetailEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.source).toBe("etsy");
    expect(record.signalType).toBe("price");
    expect(record.market).toBe("US");
    expect(record.seed).toBe("handmade jewelry");
    expect(record.capturedAt).toBe(FIXED_NOW);
    expect(record.payload.resultCount).toBe(5);
    expect(record.payload.minPrice).toBe(32.5);
    expect(record.payload.maxPrice).toBe(878.8);
    expect(record.payload.medianPrice).toBe(150);
    expect(record.payload.freeShipCount).toBe(4);
    expect(record.payload.avgPrice).toBeCloseTo(350.826, 10);
    expect(record.payload.freeShipShare).toBeCloseTo(0.8, 12);
    expect(record.payload.priceSpread).toBeCloseTo(
      0.9630177514792899,
      12,
    );
    expect(record.payload.normalizedValue).toBeCloseTo(
      0.9630177514792899,
      12,
    );
    expect(record.payload.listings).toHaveLength(5);
  });

  it("returns no record for an empty dataset", () => {
    const entry = createEtsyDetailEntry({ now: () => FIXED_NOW });

    expect(entry.normalize([], INPUT)).toEqual([]);
  });
});
