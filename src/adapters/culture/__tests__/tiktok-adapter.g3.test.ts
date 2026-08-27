import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../../packages/contracts";
import fixture from "../__fixtures__/tiktok-response.provisional.json";
import { tiktokAdapter } from "../tiktok-adapter";

const REQUEST: CrawlRequest = {
  source: "tiktok",
  market: "US",
  seed: "retro halloween cats",
  productType: "mug",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 25,
  mode: "live",
};

describe("tiktokAdapter G3", () => {
  it("adapts a canonical request into the provisional provider descriptor", () => {
    expect(tiktokAdapter.source).toBe("tiktok");
    expect(tiktokAdapter.adapt(REQUEST)).toEqual({
      searchQuery: "retro halloween cats",
      region: "US",
      productType: "mug",
      startDate: "2026-08-01",
      endDate: "2026-08-27",
      maxResults: 25,
      mode: "live",
    });
  });

  it("normalizes the saved provisional response into one culture record with images", () => {
    expect(tiktokAdapter.normalize(fixture)).toEqual([
      {
        source: "tiktok",
        market: "US",
        seed: "retro halloween cats",
        capturedAt: "2026-08-27T03:15:00.000Z",
        signalType: "culture",
        payload: {
          normalizedValue: 0.9,
          videoCount: 28,
          viewCount: 845000,
          referenceImageUrls: [
            "https://images.example/tiktok/retro-cat-cover-1.png",
            "https://images.example/tiktok/retro-cat-cover-2.png",
          ],
        },
        rawRef: "raw/culture/tiktok/retro-halloween-cats.json",
      },
    ]);
  });

  it("returns one aggregate record while filtering malformed fields", () => {
    expect(
      tiktokAdapter.normalize({
        context: fixture.context,
        data: {
          normalizedValue: Number.POSITIVE_INFINITY,
          videoCount: "28",
          viewCount: 500,
          videos: [{ id: "one" }, { id: "two" }],
          images: [
            { url: "https://images.example/tiktok/valid.png" },
            { url: 123 },
            false,
          ],
        },
      }),
    ).toEqual([
      {
        source: "tiktok",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "culture",
        payload: {
          normalizedValue: undefined,
          videoCount: undefined,
          viewCount: 500,
          referenceImageUrls: ["https://images.example/tiktok/valid.png"],
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each([false, { context: 42 }, { context: fixture.context }])(
    "returns no records and logs for malformed input %#",
    (providerOutput) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(tiktokAdapter.normalize(providerOutput)).toEqual([]);
      expect(warning).toHaveBeenCalled();

      warning.mockRestore();
    },
  );
});
