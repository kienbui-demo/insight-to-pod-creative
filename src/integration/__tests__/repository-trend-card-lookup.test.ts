import { describe, expect, it } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import { CACHE_SIM_THRESHOLD } from "../../../packages/config/cache.config";
import { COMPLETE_TREND_CARD } from "../../agent/__fixtures__/trend-card";
import type {
  CacheKey,
  SimilarityMatch,
} from "../../storage/cache-types";
import type { TrendCardRepository } from "../../storage/trend-card-repository";
import { createRepositoryTrendCardLookup } from "../repository-trend-card-lookup";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

class FakeTrendCardRepository implements TrendCardRepository {
  readonly exactKeys: CacheKey[] = [];
  readonly similarKeys: CacheKey[] = [];

  constructor(
    private readonly exactResult: typeof COMPLETE_TREND_CARD | null,
    private readonly similarResult: SimilarityMatch | null,
  ) {}

  async listRecent() {
    return [];
  }

  async findById() {
    return null;
  }

  async findExact(key: CacheKey) {
    this.exactKeys.push(key);
    return this.exactResult;
  }

  async findSimilar(key: CacheKey) {
    this.similarKeys.push(key);
    return this.similarResult;
  }
}

describe("createRepositoryTrendCardLookup", () => {
  it("returns an exact hit without querying similarity", async () => {
    const repository = new FakeTrendCardRepository(COMPLETE_TREND_CARD, null);
    const lookup = createRepositoryTrendCardLookup(repository);

    await expect(lookup.lookup(CRAWL)).resolves.toEqual({
      kind: "hit",
      card: COMPLETE_TREND_CARD,
    });
    expect(repository.exactKeys).toHaveLength(1);
    expect(repository.similarKeys).toEqual([]);
  });

  it("returns a semantic hit at or above the configured threshold", async () => {
    const repository = new FakeTrendCardRepository(null, {
      card: COMPLETE_TREND_CARD,
      similarity: 0.9,
    });
    const lookup = createRepositoryTrendCardLookup(repository);

    expect(0.9).toBeGreaterThanOrEqual(CACHE_SIM_THRESHOLD);
    await expect(lookup.lookup(CRAWL)).resolves.toEqual({
      kind: "hit",
      card: COMPLETE_TREND_CARD,
    });
  });

  it("returns a miss below the configured similarity threshold", async () => {
    const repository = new FakeTrendCardRepository(null, {
      card: COMPLETE_TREND_CARD,
      similarity: 0.5,
    });
    const lookup = createRepositoryTrendCardLookup(repository);

    expect(0.5).toBeLessThan(CACHE_SIM_THRESHOLD);
    await expect(lookup.lookup(CRAWL)).resolves.toEqual({ kind: "miss" });
  });

  it("returns a miss when both repository lookups miss", async () => {
    const repository = new FakeTrendCardRepository(null, null);
    const lookup = createRepositoryTrendCardLookup(repository);

    await expect(lookup.lookup(CRAWL)).resolves.toEqual({ kind: "miss" });
    expect(repository.exactKeys).toHaveLength(1);
    expect(repository.similarKeys).toHaveLength(1);
  });

  it("passes a normalized CrawlRequest key to both repository lookups", async () => {
    const repository = new FakeTrendCardRepository(null, null);
    const lookup = createRepositoryTrendCardLookup(repository);

    await lookup.lookup({
      ...CRAWL,
      seed: "  ReTrO Halloween Cats  ",
    });

    const expectedKey = {
      market: "US",
      seed: "retro halloween cats",
      productType: "t-shirt",
    } satisfies CacheKey;
    expect(repository.exactKeys).toEqual([expectedKey]);
    expect(repository.similarKeys).toEqual([expectedKey]);
  });
});
