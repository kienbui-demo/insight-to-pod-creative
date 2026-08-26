import { describe, expect, it } from "vitest";

import { CACHE_SIM_THRESHOLD } from "../../../packages/config/cache.config";
import type { CrawlRequest } from "../../../packages/contracts";
import { resolveTrendCard } from "../cache-decision";
import {
  EXACT_TREND_CARD,
  MA_TREND_CARD,
  SEMANTIC_TREND_CARD,
} from "../__fixtures__/trend-cards";
import { FakeTrendCardRepository } from "./support/fake-trend-card-repository";
import { MockMaDeepDive } from "./support/mock-ma-deep-dive";

const BASE_REQUEST: CrawlRequest = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
};

describe("resolveTrendCard G2 cache threshold", () => {
  it("returns a near-duplicate above the threshold without calling MA", async () => {
    const repository = new FakeTrendCardRepository({
      similar: {
        card: SEMANTIC_TREND_CARD,
        similarity: CACHE_SIM_THRESHOLD + 0.01,
      },
    });
    const ma = new MockMaDeepDive(MA_TREND_CARD);

    const result = await resolveTrendCard(BASE_REQUEST, { repository, ma });

    expect(result).toEqual({ kind: "semantic", card: SEMANTIC_TREND_CARD });
    expect(repository.findExactCalls).toHaveLength(1);
    expect(repository.findSimilarCalls).toHaveLength(1);
    expect(ma.calls).toHaveLength(0);
  });

  it("treats similarity exactly at the configured threshold as a hit", async () => {
    const repository = new FakeTrendCardRepository({
      similar: {
        card: SEMANTIC_TREND_CARD,
        similarity: CACHE_SIM_THRESHOLD,
      },
    });
    const ma = new MockMaDeepDive(MA_TREND_CARD);

    const result = await resolveTrendCard(BASE_REQUEST, { repository, ma });

    expect(result).toEqual({ kind: "semantic", card: SEMANTIC_TREND_CARD });
    expect(ma.calls).toHaveLength(0);
  });

  it("calls MA once when an unrelated candidate is below the threshold", async () => {
    const request: CrawlRequest = {
      ...BASE_REQUEST,
      seed: "quantum computing graduation",
    };
    const repository = new FakeTrendCardRepository({
      similar: {
        card: SEMANTIC_TREND_CARD,
        similarity: CACHE_SIM_THRESHOLD - 0.01,
      },
    });
    const ma = new MockMaDeepDive(MA_TREND_CARD);

    const result = await resolveTrendCard(request, { repository, ma });

    expect(result).toEqual({ kind: "miss", card: MA_TREND_CARD });
    expect(repository.findExactCalls).toHaveLength(1);
    expect(repository.findSimilarCalls).toHaveLength(1);
    expect(ma.calls).toEqual([request]);
  });

  it("normalizes the seed and gives an exact match precedence", async () => {
    const request: CrawlRequest = {
      ...BASE_REQUEST,
      seed: "  ReTrO HaLLoWeeN CaT  ",
    };
    const repository = new FakeTrendCardRepository({
      exact: EXACT_TREND_CARD,
      similar: {
        card: SEMANTIC_TREND_CARD,
        similarity: CACHE_SIM_THRESHOLD + 0.01,
      },
    });
    const ma = new MockMaDeepDive(MA_TREND_CARD);

    const result = await resolveTrendCard(request, { repository, ma });

    expect(result).toEqual({ kind: "exact", card: EXACT_TREND_CARD });
    expect(repository.findExactCalls).toEqual([
      {
        market: "US",
        seed: "retro halloween cat",
        productType: "t-shirt",
      },
    ]);
    expect(repository.findSimilarCalls).toHaveLength(0);
    expect(ma.calls).toHaveLength(0);
  });
});
