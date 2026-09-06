import { describe, expect, it } from "vitest";

import type { TrendCard } from "../../../packages/contracts";
import { deriveSellerInsights } from "../derive-seller-insights";
import { RETRO_HALLOWEEN_CATS_CARD } from "./fixtures";

function sparseCard(overrides: Partial<TrendCard> = {}): TrendCard {
  return {
    ...RETRO_HALLOWEEN_CATS_CARD,
    id: "sparse-card",
    opportunityScore: 50,
    confidence: 0,
    availableSources: [],
    missingSources: [],
    trendSeries: [],
    competitors: undefined,
    ...overrides,
  };
}

describe("deriveSellerInsights", () => {
  it("derives seller-facing demand, competition, confidence, and verdict metrics", () => {
    const insights = deriveSellerInsights(RETRO_HALLOWEEN_CATS_CARD);

    expect(insights.demand.growthPct).toBeCloseTo(175);
    expect(insights.demand.momentum).toBe("accelerating");
    expect(insights.demand.peak).toEqual({ t: "2026-09-05", v: 55 });
    expect(insights.demand.currentVsPeakPct).toBe(100);
    expect(insights.demand.seasonalWindow).toBe("2026-09-05");

    expect(insights.competition.priceBand).toEqual({
      min: 19.99,
      median: 24.99,
      max: 34.99,
    });
    expect(insights.competition.activeAdRatio).toBe(0.5);
    expect(insights.competition.competitorCount).toBe(4);
    expect(insights.competition.saturation).toBe("medium");
    expect(insights.competition.provenIntent).toBe(true);

    expect(insights.confidence.sourceCoveragePct).toBeCloseTo(5 / 6 * 100);
    expect(insights.confidence.freshnessTier).toBe("hot");
    expect(insights.confidence.confidencePct).toBe(91);
    expect(insights.confidence.missingSources).toEqual(["tiktok"]);
    expect(insights.verdict).toBe("act-now");
  });

  it("handles an empty series and no competitors without throwing", () => {
    const card = sparseCard();

    expect(() => deriveSellerInsights(card)).not.toThrow();
    expect(deriveSellerInsights(card)).toMatchObject({
      demand: {
        growthPct: null,
        momentum: "unknown",
        peak: null,
        currentVsPeakPct: null,
        seasonalWindow: null,
      },
      competition: {
        priceBand: null,
        activeAdRatio: null,
        competitorCount: 0,
        saturation: "unknown",
        provenIntent: false,
      },
      confidence: {
        sourceCoveragePct: 0,
        confidencePct: 0,
      },
      verdict: "watch",
    });
  });

  it("uses null or zero rather than propagating non-finite values", () => {
    const insights = deriveSellerInsights(
      sparseCard({
        confidence: Number.NaN,
        trendSeries: [
          { t: "bad", v: Number.NaN },
          { t: "also-bad", v: Number.POSITIVE_INFINITY },
        ],
        competitors: [
          { title: "Invalid price", price: Number.NaN, adActive: true },
        ],
      }),
    );

    expect(insights.demand.growthPct).toBeNull();
    expect(insights.demand.currentVsPeakPct).toBeNull();
    expect(insights.demand.peak).toEqual({ t: "bad", v: 0 });
    expect(insights.competition.priceBand).toBeNull();
    expect(insights.confidence.confidencePct).toBe(0);
    expect(JSON.stringify(insights)).not.toContain("NaN");
  });

  it.each([
    [75, "act-now"],
    [74.99, "watch"],
    [50, "watch"],
    [49.99, "skip"],
  ] as const)("maps score %s to the %s verdict", (score, verdict) => {
    expect(
      deriveSellerInsights(sparseCard({ opportunityScore: score })).verdict,
    ).toBe(verdict);
  });

  it("distinguishes steady and cooling momentum", () => {
    expect(
      deriveSellerInsights(
        sparseCard({
          trendSeries: [
            { t: "1", v: 10 },
            { t: "2", v: 20 },
            { t: "3", v: 30 },
          ],
        }),
      ).demand.momentum,
    ).toBe("steady");
    expect(
      deriveSellerInsights(
        sparseCard({
          trendSeries: [
            { t: "1", v: 10 },
            { t: "2", v: 30 },
            { t: "3", v: 35 },
          ],
        }),
      ).demand.momentum,
    ).toBe("cooling");
  });
});
