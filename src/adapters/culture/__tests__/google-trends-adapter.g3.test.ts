import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../../packages/contracts";
import fixture from "../__fixtures__/google-trends-response.provisional.json";
import { googleTrendsAdapter } from "../google-trends-adapter";

const REQUEST: CrawlRequest = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 50,
  mode: "batch",
};

describe("googleTrendsAdapter G3", () => {
  it("adapts a canonical request into the provisional provider descriptor", () => {
    expect(googleTrendsAdapter.source).toBe("google_trends");
    expect(googleTrendsAdapter.adapt(REQUEST)).toEqual({
      keywords: ["retro halloween cats"],
      geo: "US",
      productType: "t-shirt",
      timeframe: { from: "2026-08-01", to: "2026-08-27" },
      limit: 50,
      mode: "batch",
    });
  });

  it("normalizes the saved provisional response into one culture record", () => {
    expect(googleTrendsAdapter.normalize(fixture)).toEqual([
      {
        source: "google_trends",
        market: "US",
        seed: "retro halloween cats",
        capturedAt: "2026-08-27T03:00:00.000Z",
        signalType: "culture",
        payload: {
          normalizedValue: 0.8,
          trendSeries: [
            { t: "2026-08-01", v: 42 },
            { t: "2026-08-08", v: 58 },
            { t: "2026-08-15", v: 76 },
          ],
        },
        rawRef: "raw/culture/google-trends/retro-halloween-cats.json",
      },
    ]);
  });

  it("keeps valid partial trend points and rejects an invalid normalized value", () => {
    expect(
      googleTrendsAdapter.normalize({
        context: fixture.context,
        data: {
          normalizedValue: 1.1,
          timeline: [
            { date: "2026-08-01", value: 42 },
            { date: 123, value: 50 },
            null,
          ],
        },
      }),
    ).toEqual([
      {
        source: "google_trends",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "culture",
        payload: {
          normalizedValue: undefined,
          trendSeries: [{ t: "2026-08-01", v: 42 }],
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each([null, {}, { context: {}, data: {} }])(
    "returns no records and logs for malformed input %#",
    (providerOutput) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(googleTrendsAdapter.normalize(providerOutput)).toEqual([]);
      expect(warning).toHaveBeenCalled();

      warning.mockRestore();
    },
  );
});
