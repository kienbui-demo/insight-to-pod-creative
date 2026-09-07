import { describe, expect, it } from "vitest";

import type { CanonicalRecord } from "../../../../packages/contracts";
import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/meta-ads-search.dataset.json";
import {
  createMetaAdsSearchEntry,
  META_ADS_SEARCH_ACTOR_SLUG,
} from "../meta-ads-search";

const FIXED_NOW = "2026-09-04T00:00:00.000Z";
const INPUT: CrawlPortInput = {
  source: "meta_ads",
  market: "US",
  seed: "leather wallet",
  limit: 10,
};

function adsFrom(record: CanonicalRecord): readonly unknown[] {
  const ads = record.payload.ads;
  expect(Array.isArray(ads)).toBe(true);
  if (!Array.isArray(ads)) {
    throw new Error("expected normalized ads array");
  }
  return ads;
}

describe("createMetaAdsSearchEntry", () => {
  it("builds the exact verified Meta Ads actor input", () => {
    const entry = createMetaAdsSearchEntry();

    expect(META_ADS_SEARCH_ACTOR_SLUG).toBe(
      "curious_coder/facebook-ads-library-scraper",
    );
    expect(entry.actorSlug).toBe(META_ADS_SEARCH_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      count: 10,
      scrapeAdDetails: false,
      "scrapePageAds.activeStatus": "all",
      "scrapePageAds.countryCode": "ALL",
      "scrapePageAds.sortBy": "impressions_desc",
      urls: [
        {
          url: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=leather%20wallet&search_type=keyword_unordered&media_type=all",
        },
      ],
    });
    expect(entry.buildInput({ ...INPUT, limit: undefined }).count).toBe(100);
  });

  it("normalizes the real fixture into one aggregated ad record", () => {
    const entry = createMetaAdsSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "meta_ads",
      market: "US",
      seed: "leather wallet",
      capturedAt: FIXED_NOW,
      signalType: "ad",
      payload: { resultCount: 10 },
    });
    expect(adsFrom(records[0])).toHaveLength(10);
  });

  it("counts distinct advertisers from the real fixture", () => {
    const entry = createMetaAdsSearchEntry({ now: () => FIXED_NOW });
    const [record] = entry.normalize(fixture, INPUT);

    expect(record.payload.distinctAdvertisers).toBe(7);
  });

  it("computes aggregate activity and the normalized value", () => {
    const entry = createMetaAdsSearchEntry({ now: () => FIXED_NOW });
    const [record] = entry.normalize(fixture, INPUT);
    const totalMatchedAds = fixture.find(
      (item) => Number.isFinite(item.total),
    )?.total;
    if (totalMatchedAds === undefined) {
      throw new Error("expected fixture total");
    }
    const avgActiveDays =
      fixture.reduce(
        (sum, item) => sum + (item.end_date - item.start_date) / 86_400,
        0,
      ) / fixture.length;
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
    const breadthScore = clamp01(Math.log10(totalMatchedAds + 1) / 5);
    const longevityScore = clamp01(avgActiveDays / 180);
    const expectedNormalizedValue = clamp01(
      0.5 * breadthScore + 0.5 * longevityScore,
    );

    expect(record.payload.resultCount).toBe(10);
    expect(record.payload.totalMatchedAds).toBe(8577);
    expect(record.payload.avgActiveDays).toBeCloseTo(
      130.49166666666667,
      6,
    );
    expect(expectedNormalizedValue).toBeCloseTo(0.7558154560421573, 12);
    expect(record.payload.normalizedValue).toBeGreaterThanOrEqual(0);
    expect(record.payload.normalizedValue).toBeLessThanOrEqual(1);
    expect(record.payload.normalizedValue).toBeCloseTo(
      expectedNormalizedValue,
      12,
    );
  });

  it("returns zero aggregates for an empty dataset", () => {
    const entry = createMetaAdsSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize([], INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "meta_ads",
      capturedAt: FIXED_NOW,
      signalType: "ad",
      payload: {
        resultCount: 0,
        totalMatchedAds: 0,
        distinctAdvertisers: 0,
        avgActiveDays: 0,
        normalizedValue: 0,
        ads: [],
      },
    });
  });
});
