import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../../packages/contracts";
import fixture from "../__fixtures__/etsy-response.provisional.json";
import { etsyAdapter } from "../etsy-adapter";

const REQUEST: CrawlRequest = {
  source: "etsy",
  market: "DE",
  seed: "retro halloween cats",
  productType: "mug",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 50,
  mode: "live",
};

describe("etsyAdapter G3", () => {
  it("adapts a canonical request into the exact provisional descriptor", () => {
    expect(etsyAdapter.source).toBe("etsy");
    expect(etsyAdapter.adapt(REQUEST)).toEqual({
      query: "retro halloween cats",
      country: "DE",
      productType: "mug",
      startDate: "2026-08-01",
      endDate: "2026-08-27",
      limit: 50,
      mode: "live",
    });
  });

  it("normalizes the fixture into one demand and one already-inverse price record", () => {
    const records = etsyAdapter.normalize(fixture);

    expect(records).toHaveLength(2);
    expect(records).toEqual([
      {
        source: "etsy",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "demand",
        payload: {
          normalizedValue: 0.64,
          searchVolume: 7300,
          rank: 860,
          competitors: [
            { title: "Spooky Cat Sweatshirt", price: 27.5 },
            { title: "Halloween Cat Mug", price: 16.25 },
          ],
        },
        rawRef: fixture.context.rawRef,
      },
      {
        source: "etsy",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "price",
        payload: {
          normalizedValue: 0.77,
          minimumPrice: 14.5,
          maximumPrice: 31.99,
          medianPrice: 22,
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
      const records = etsyAdapter.normalize({
        context: fixture.context,
        data: {
          demand: { ...fixture.data.demand, normalizedValue: value },
          price: { ...fixture.data.price, normalizedValue: value },
          listings: fixture.data.listings,
        },
      });

      expect(records[0].payload.normalizedValue).toBeUndefined();
      expect(records[1].payload.normalizedValue).toBeUndefined();
    },
  );

  it("returns best-effort records and filters malformed listings", () => {
    const input = {
      context: fixture.context,
      data: {
        demand: {
          normalizedValue: 0.45,
          searchVolume: null,
          rank: "top",
        },
        price: {
          normalizedValue: 0.8,
          minimumPrice: 12,
          maximumPrice: Number.POSITIVE_INFINITY,
          medianPrice: "20",
        },
        listings: [
          { title: "Valid listing", price: 20 },
          { title: "Valid title only", price: Number.NaN },
          { title: false, price: 18 },
          { href: "missing-title" },
          undefined,
        ],
      },
    };

    expect(() => etsyAdapter.normalize(input)).not.toThrow();
    expect(etsyAdapter.normalize(input)).toEqual([
      {
        source: "etsy",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "demand",
        payload: {
          normalizedValue: 0.45,
          searchVolume: undefined,
          rank: undefined,
          competitors: [
            { title: "Valid listing", price: 20 },
            { title: "Valid title only" },
          ],
        },
        rawRef: fixture.context.rawRef,
      },
      {
        source: "etsy",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "price",
        payload: {
          normalizedValue: 0.8,
          minimumPrice: 12,
          maximumPrice: undefined,
          medianPrice: undefined,
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each([false, "bad", {}, { data: {} }, { context: fixture.context, data: [] }])(
    "returns no records and warns for malformed input %#",
    (providerOutput) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(etsyAdapter.normalize(providerOutput)).toEqual([]);
      expect(warning).toHaveBeenCalled();

      warning.mockRestore();
    },
  );
});
