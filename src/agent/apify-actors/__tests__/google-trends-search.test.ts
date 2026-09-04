import { describe, expect, it } from "vitest";

import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/google-trends-detail.dataset.json";
import {
  GOOGLE_TRENDS_ACTOR_SLUG,
  createGoogleTrendsEntry,
} from "../google-trends-search";

const FIXED_NOW = "2026-09-04T12:34:56.000Z";
const INPUT: CrawlPortInput = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  limit: 5,
};

describe("createGoogleTrendsEntry", () => {
  it("builds the exact Google Trends actor input for a market", () => {
    const entry = createGoogleTrendsEntry();

    expect(GOOGLE_TRENDS_ACTOR_SLUG).toBe(
      "steadyfetch/google-trends-scraper",
    );
    expect(entry.actorSlug).toBe(GOOGLE_TRENDS_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      searchTerms: ["retro halloween cats"],
      geo: "US",
      timeRange: "today 12-m",
      surfaces: ["interestOverTime"],
    });
  });

  it("treats worldwide market sentinels as an empty geo", () => {
    const entry = createGoogleTrendsEntry();

    for (const market of ["", "WW", "WORLD", "worldwide", "Global"]) {
      expect(
        entry.buildInput({ ...INPUT, market }).geo,
      ).toBe("");
    }
  });

  it("normalizes the interestOverTime surface into one culture record", () => {
    const entry = createGoogleTrendsEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.source).toBe("google_trends");
    expect(record.signalType).toBe("culture");
    expect(record.market).toBe("US");
    expect(record.seed).toBe("retro halloween cats");
    expect(record.capturedAt).toBe(FIXED_NOW);
    expect(record.payload.pointCount).toBe(6);
    expect(record.payload.normalizedValue).toBeCloseTo(0.4133333333, 10);
    expect(record.payload.trendSeries).toEqual([
      { t: "2025-08-24T00:00:00.000Z", v: 50 },
      { t: "2025-08-31T00:00:00.000Z", v: 45 },
      { t: "2025-09-07T00:00:00.000Z", v: 41 },
      { t: "2025-09-14T00:00:00.000Z", v: 39 },
      { t: "2025-09-21T00:00:00.000Z", v: 42 },
      { t: "2025-09-28T00:00:00.000Z", v: 43 },
    ]);
  });

  it("returns no record for an empty dataset", () => {
    const entry = createGoogleTrendsEntry({ now: () => FIXED_NOW });

    expect(entry.normalize([], INPUT)).toEqual([]);
  });

  it("returns no record when no interestOverTime surface is present", () => {
    const entry = createGoogleTrendsEntry({ now: () => FIXED_NOW });
    const onlyRelated = fixture.filter(
      (row) => row.surface !== "interestOverTime",
    );

    expect(entry.normalize(onlyRelated, INPUT)).toEqual([]);
  });
});
