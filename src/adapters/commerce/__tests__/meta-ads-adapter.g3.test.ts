import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../../packages/contracts";
import fixture from "../__fixtures__/meta-ads-response.provisional.json";
import { metaAdsAdapter } from "../meta-ads-adapter";

const REQUEST: CrawlRequest = {
  source: "meta_ads",
  market: "US",
  seed: "retro halloween cats",
  productType: "poster",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 25,
  mode: "live",
};

describe("metaAdsAdapter G3", () => {
  it("adapts a canonical request into the exact provisional descriptor", () => {
    expect(metaAdsAdapter.source).toBe("meta_ads");
    expect(metaAdsAdapter.adapt(REQUEST)).toEqual({
      searchQuery: "retro halloween cats",
      country: "US",
      productType: "poster",
      startDate: "2026-08-01",
      endDate: "2026-08-27",
      maxResults: 25,
      mode: "live",
    });
  });

  it("normalizes the fixture into exactly one aggregate ad record", () => {
    const records = metaAdsAdapter.normalize(fixture);

    expect(records).toHaveLength(1);
    expect(records).toEqual([
      {
        source: "meta_ads",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "ad",
        payload: {
          normalizedValue: 0.74,
          activeAdCount: 39,
          longestActiveDays: 46,
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, "0.5"])(
    "rejects rather than clamps an unusable normalizedValue of %s",
    (value) => {
      const records = metaAdsAdapter.normalize({
        context: fixture.context,
        data: {
          ad: { ...fixture.data.ad, normalizedValue: value },
        },
      });

      expect(records).toHaveLength(1);
      expect(records[0].payload.normalizedValue).toBeUndefined();
    },
  );

  it("returns one best-effort record for partial aggregate ad data", () => {
    const input = {
      context: fixture.context,
      data: {
        ad: {
          normalizedValue: 0.3,
          activeAdCount: "39",
          longestActiveDays: Number.NEGATIVE_INFINITY,
        },
      },
    };

    expect(() => metaAdsAdapter.normalize(input)).not.toThrow();
    expect(metaAdsAdapter.normalize(input)).toEqual([
      {
        source: "meta_ads",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "ad",
        payload: {
          normalizedValue: 0.3,
          activeAdCount: undefined,
          longestActiveDays: undefined,
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each([undefined, [], {}, { context: 42 }, { context: fixture.context, data: null }])(
    "returns no records and warns for malformed input %#",
    (providerOutput) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(metaAdsAdapter.normalize(providerOutput)).toEqual([]);
      expect(warning).toHaveBeenCalled();

      warning.mockRestore();
    },
  );
});
