import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../../packages/contracts";
import fixture from "../__fixtures__/reddit-response.provisional.json";
import { redditAdapter } from "../reddit-adapter";

const REQUEST: CrawlRequest = {
  source: "reddit",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 100,
  mode: "live",
};

describe("redditAdapter G3", () => {
  it("adapts a canonical request into the provisional provider descriptor", () => {
    expect(redditAdapter.source).toBe("reddit");
    expect(redditAdapter.adapt(REQUEST)).toEqual({
      query: "retro halloween cats",
      country: "US",
      productType: "t-shirt",
      since: "2026-08-01",
      until: "2026-08-27",
      limit: 100,
      mode: "live",
    });
  });

  it("normalizes the saved provisional response into one aggregate culture record", () => {
    expect(redditAdapter.normalize(fixture)).toEqual([
      {
        source: "reddit",
        market: "US",
        seed: "retro halloween cats",
        capturedAt: "2026-08-27T03:05:00.000Z",
        signalType: "culture",
        payload: {
          normalizedValue: 0.6,
          mentionCount: 37,
          engagementCount: 1240,
        },
        rawRef: "raw/culture/reddit/retro-halloween-cats.json",
      },
    ]);
  });

  it("returns one best-effort record for partial aggregate data", () => {
    expect(
      redditAdapter.normalize({
        context: fixture.context,
        data: {
          normalizedValue: Number.NaN,
          mentionCount: 12,
          engagementCount: "unknown",
          posts: [{ id: "one" }, { id: "two" }],
        },
      }),
    ).toEqual([
      {
        source: "reddit",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "culture",
        payload: {
          normalizedValue: undefined,
          mentionCount: 12,
          engagementCount: undefined,
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each([undefined, [], { context: null, data: {} }])(
    "returns no records and logs for malformed input %#",
    (providerOutput) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(redditAdapter.normalize(providerOutput)).toEqual([]);
      expect(warning).toHaveBeenCalled();

      warning.mockRestore();
    },
  );
});
