import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../../packages/contracts";
import fixture from "../__fixtures__/amazon-response.provisional.json";
import { amazonAdapter } from "../amazon-adapter";

const REQUEST: CrawlRequest = {
  source: "amazon",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 25,
  mode: "batch",
};

describe("amazonAdapter G3", () => {
  it("adapts a canonical request into the exact provisional descriptor", () => {
    expect(amazonAdapter.source).toBe("amazon");
    expect(amazonAdapter.adapt(REQUEST)).toEqual({
      type: "search",
      searchTerm: "retro halloween cats",
      market: "US",
      productType: "t-shirt",
      startDate: "2026-08-01",
      endDate: "2026-08-27",
      maxResults: 25,
      mode: "batch",
    });
  });

  it("normalizes the fixture into one demand and one already-inverse competition record", () => {
    const records = amazonAdapter.normalize(fixture);

    expect(records).toHaveLength(2);
    expect(records).toEqual([
      {
        source: "amazon",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "demand",
        payload: {
          normalizedValue: 0.82,
          searchVolume: 18400,
          bestSellerRank: 1320,
          competitors: [
            { title: "Vintage Black Cat Shirt", price: 21.99 },
            { title: "Retro Halloween Cat Tee", price: 18.5 },
          ],
        },
        rawRef: fixture.context.rawRef,
      },
      {
        source: "amazon",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "competition",
        payload: {
          normalizedValue: 0.68,
          competitorCount: 247,
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
    expect(records[0].payload).toHaveProperty("competitors");
    expect(records[1].payload).not.toHaveProperty("competitors");
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, "0.5"])(
    "rejects rather than clamps an unusable normalizedValue of %s",
    (value) => {
      const records = amazonAdapter.normalize({
        context: fixture.context,
        data: {
          demand: { ...fixture.data.demand, normalizedValue: value },
          competition: {
            ...fixture.data.competition,
            normalizedValue: value,
          },
          products: fixture.data.products,
        },
      });

      expect(records[0].payload.normalizedValue).toBeUndefined();
      expect(records[1].payload.normalizedValue).toBeUndefined();
    },
  );

  it("returns best-effort records and filters malformed products", () => {
    const input = {
      context: fixture.context,
      data: {
        demand: {
          normalizedValue: 0.4,
          searchVolume: "many",
          bestSellerRank: Number.NaN,
        },
        competition: {
          normalizedValue: 0.9,
          competitorCount: Number.POSITIVE_INFINITY,
        },
        products: [
          { title: "Valid product", price: 19.99 },
          { title: "Valid title only", price: "unknown" },
          { title: 42, price: 12 },
          { price: 10 },
          null,
        ],
      },
    };

    expect(() => amazonAdapter.normalize(input)).not.toThrow();
    expect(amazonAdapter.normalize(input)).toEqual([
      {
        source: "amazon",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "demand",
        payload: {
          normalizedValue: 0.4,
          searchVolume: undefined,
          bestSellerRank: undefined,
          competitors: [
            { title: "Valid product", price: 19.99 },
            { title: "Valid title only" },
          ],
        },
        rawRef: fixture.context.rawRef,
      },
      {
        source: "amazon",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "competition",
        payload: {
          normalizedValue: 0.9,
          competitorCount: undefined,
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each([null, [], {}, { context: {}, data: {} }, { context: fixture.context }])(
    "returns no records and warns for malformed input %#",
    (providerOutput) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(amazonAdapter.normalize(providerOutput)).toEqual([]);
      expect(warning).toHaveBeenCalled();

      warning.mockRestore();
    },
  );
});
