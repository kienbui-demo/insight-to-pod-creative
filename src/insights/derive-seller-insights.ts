import type { CrawlSource, TrendCard } from "../../packages/contracts";

export type DemandMomentum =
  | "accelerating"
  | "steady"
  | "cooling"
  | "unknown";

export type CompetitionSaturation = "low" | "medium" | "high" | "unknown";

export type OpportunityVerdict = "act-now" | "watch" | "skip";

export interface SellerInsights {
  demand: {
    growthPct: number | null;
    momentum: DemandMomentum;
    peak: { t: string; v: number } | null;
    currentVsPeakPct: number | null;
    seasonalWindow: string | null;
  };
  competition: {
    priceBand: { min: number; median: number; max: number } | null;
    activeAdRatio: number | null;
    competitorCount: number;
    saturation: CompetitionSaturation;
    provenIntent: boolean;
  };
  confidence: {
    sourceCoveragePct: number;
    freshnessTier: TrendCard["freshnessTier"];
    confidencePct: number;
    missingSources: CrawlSource[];
  };
  verdict: OpportunityVerdict;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deriveMomentum(values: readonly number[]): DemandMomentum {
  if (values.length < 3) {
    return "unknown";
  }

  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const splitAt = Math.floor(deltas.length / 2);
  const firstHalfSlope = average(deltas.slice(0, splitAt));
  const secondHalfSlope = average(deltas.slice(splitAt));
  const difference = secondHalfSlope - firstHalfSlope;

  if (Math.abs(difference) <= Number.EPSILON) {
    return "steady";
  }

  return difference > 0 ? "accelerating" : "cooling";
}

function derivePriceBand(
  competitors: NonNullable<TrendCard["competitors"]>,
): SellerInsights["competition"]["priceBand"] {
  const prices = competitors
    .map((competitor) => competitor.price)
    .filter((price): price is number =>
      price !== undefined && Number.isFinite(price),
    )
    .sort((left, right) => left - right);

  if (prices.length === 0) {
    return null;
  }

  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[middle - 1] + prices[middle]) / 2
      : prices[middle];

  return {
    min: prices[0],
    median: finiteOrZero(median),
    max: prices[prices.length - 1],
  };
}

function deriveSaturation(count: number): CompetitionSaturation {
  if (count === 0) {
    return "unknown";
  }
  if (count <= 2) {
    return "low";
  }
  if (count <= 6) {
    return "medium";
  }
  return "high";
}

export function deriveSellerInsights(card: TrendCard): SellerInsights {
  const series = card.trendSeries.map((point) => ({
    t: point.t,
    v: finiteOrZero(point.v),
  }));
  const values = series.map((point) => point.v);
  const first = series[0];
  const last = series[series.length - 1];
  const peak = series.reduce<(typeof series)[number] | null>(
    (highest, point) =>
      highest === null || point.v > highest.v ? point : highest,
    null,
  );
  const growthPct =
    series.length < 2 || first.v === 0
      ? null
      : finiteOrNull(((last.v - first.v) / first.v) * 100);
  const currentVsPeakPct =
    last === undefined || peak === null || peak.v === 0
      ? null
      : finiteOrNull((last.v / peak.v) * 100);

  const competitors = card.competitors ?? [];
  const competitorCount = competitors.length;
  const activeAdRatio =
    competitorCount === 0
      ? null
      : competitors.filter((competitor) => competitor.adActive === true).length /
        competitorCount;

  const availableCount = card.availableSources.length;
  const missingCount = card.missingSources.length;
  const totalSourceCount = availableCount + missingCount;
  const sourceCoveragePct =
    totalSourceCount === 0 ? 0 : (availableCount / totalSourceCount) * 100;
  const opportunityScore = finiteOrZero(card.opportunityScore);

  return {
    demand: {
      growthPct,
      momentum: deriveMomentum(values),
      peak,
      currentVsPeakPct,
      seasonalWindow: peak?.t ?? null,
    },
    competition: {
      priceBand: derivePriceBand(competitors),
      activeAdRatio,
      competitorCount,
      saturation: deriveSaturation(competitorCount),
      provenIntent:
        card.availableSources.includes("meta_ads") &&
        competitors.some((competitor) => competitor.adActive === true),
    },
    confidence: {
      sourceCoveragePct: finiteOrZero(sourceCoveragePct),
      freshnessTier: card.freshnessTier,
      confidencePct: finiteOrZero(card.confidence) * 100,
      missingSources: card.missingSources,
    },
    verdict:
      opportunityScore >= 75
        ? "act-now"
        : opportunityScore >= 50
          ? "watch"
          : "skip",
  };
}
