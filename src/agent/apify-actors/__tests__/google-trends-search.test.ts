import { describe, expect, it } from "vitest";

import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/google-trends-search.dataset.json";
import {
  GOOGLE_TRENDS_SEARCH_ACTOR_SLUG,
  createGoogleTrendsSearchEntry,
} from "../google-trends-search";

const FIXED_NOW = "2026-09-04T12:34:56.000Z";
const INPUT: CrawlPortInput = {
  source: "google_trends",
  market: "US",
  seed: "leather wallet for men",
  limit: 5,
};

describe("createGoogleTrendsSearchEntry", () => {
  it("builds the exact Google Trends actor input", () => {
    const entry = createGoogleTrendsSearchEntry();

    expect(GOOGLE_TRENDS_SEARCH_ACTOR_SLUG).toBe(
      "steadyfetch/google-trends-scraper",
    );
    expect(entry.actorSlug).toBe(GOOGLE_TRENDS_SEARCH_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      searchTerms: ["leather wallet for men"],
      geo: "US",
      timeRange: "today 12-m",
      surfaces: ["interestOverTime"],
    });
  });

  it("normalizes the interestOverTime surface into one culture record", () => {
    const entry = createGoogleTrendsSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.source).toBe("google_trends");
    expect(record.signalType).toBe("culture");
    expect(record.market).toBe("US");
    expect(record.seed).toBe("leather wallet for men");
    expect(record.capturedAt).toBe(FIXED_NOW);
    expect(record.payload.resultCount).toBe(53);
    expect(record.payload.minValue).toBe(9);
    expect(record.payload.maxValue).toBe(100);
    expect(record.payload.latestValue).toBe(19);
    expect(record.payload.avgValue).toBeCloseTo(28.528301886792452, 10);
    expect(record.payload.normalizedValue).toBeCloseTo(
      0.20666666666666667,
      12,
    );
    const trendSeries = record.payload.trendSeries as Array<{
      t: string;
      v: number;
    }>;
    expect(trendSeries).toHaveLength(53);
    expect(trendSeries[0]).toEqual({
      t: "2025-08-31T00:00:00.000Z",
      v: 13,
    });
  });

  it("returns no record for an empty dataset", () => {
    const entry = createGoogleTrendsSearchEntry({ now: () => FIXED_NOW });

    expect(entry.normalize([], INPUT)).toEqual([]);
  });
});
