import { describe, expect, it } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import { alwaysMissTrendCardLookup } from "../always-miss-trend-card-lookup";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

describe("alwaysMissTrendCardLookup", () => {
  it("always resolves a cache miss", async () => {
    await expect(alwaysMissTrendCardLookup.lookup(CRAWL)).resolves.toEqual({
      kind: "miss",
    });
  });
});
