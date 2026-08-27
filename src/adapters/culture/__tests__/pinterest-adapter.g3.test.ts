import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../../packages/contracts";
import fixture from "../__fixtures__/pinterest-response.provisional.json";
import { pinterestAdapter } from "../pinterest-adapter";

const REQUEST: CrawlRequest = {
  source: "pinterest",
  market: "US",
  seed: "retro halloween cats",
  productType: "poster",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 50,
  mode: "batch",
};

describe("pinterestAdapter G3", () => {
  it("adapts a canonical request into the provisional provider descriptor", () => {
    expect(pinterestAdapter.source).toBe("pinterest");
    expect(pinterestAdapter.adapt(REQUEST)).toEqual({
      query: "retro halloween cats",
      country: "US",
      productType: "poster",
      startDate: "2026-08-01",
      endDate: "2026-08-27",
      limit: 50,
      mode: "batch",
    });
  });

  it("normalizes the saved provisional response into one culture record with images", () => {
    expect(pinterestAdapter.normalize(fixture)).toEqual([
      {
        source: "pinterest",
        market: "US",
        seed: "retro halloween cats",
        capturedAt: "2026-08-27T03:10:00.000Z",
        signalType: "culture",
        payload: {
          normalizedValue: 0.7,
          pinCount: 920,
          saveCount: 311,
          referenceImageUrls: [
            "https://images.example/pinterest/retro-cat-1.png",
            "https://images.example/pinterest/retro-cat-2.png",
          ],
        },
        rawRef: "raw/culture/pinterest/retro-halloween-cats.json",
      },
    ]);
  });

  it("keeps only valid image URLs and valid partial metrics", () => {
    expect(
      pinterestAdapter.normalize({
        context: fixture.context,
        data: {
          normalizedValue: -0.01,
          pinCount: 10,
          saveCount: null,
          images: [
            { url: "https://images.example/pinterest/valid.png" },
            { url: "" },
            { href: "https://images.example/pinterest/wrong-key.png" },
            null,
          ],
        },
      }),
    ).toEqual([
      {
        source: "pinterest",
        market: fixture.context.market,
        seed: fixture.context.seed,
        capturedAt: fixture.context.capturedAt,
        signalType: "culture",
        payload: {
          normalizedValue: undefined,
          pinCount: 10,
          saveCount: undefined,
          referenceImageUrls: [
            "https://images.example/pinterest/valid.png",
          ],
        },
        rawRef: fixture.context.rawRef,
      },
    ]);
  });

  it.each(["bad", { data: {} }, { context: fixture.context, data: null }])(
    "returns no records and logs for malformed input %#",
    (providerOutput) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(pinterestAdapter.normalize(providerOutput)).toEqual([]);
      expect(warning).toHaveBeenCalled();

      warning.mockRestore();
    },
  );
});
