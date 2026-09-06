import type { CrawlSource, TrendCard } from "../../packages/contracts";
import type { OpportunityVerdict, SellerInsights } from "./derive-seller-insights";

export interface OpportunityReport {
  verdictTldr: string;
  whyRising: string[];
  moneyAndCompetition: string[];
  whitespace: string[];
  recommendedAction: string[];
  confidenceAndCaveats: string[];
}

const SOURCE_LABELS: Record<CrawlSource, string> = {
  google_trends: "Google Trends",
  reddit: "Reddit",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  amazon: "Amazon",
  etsy: "Etsy",
  meta_ads: "Meta Ads",
};

const PRICE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const VERDICT_COPY: Record<
  OpportunityVerdict,
  { label: string; summary: string }
> = {
  "act-now": {
    label: "Act now",
    summary: "The evidence supports moving into a focused launch test.",
  },
  watch: {
    label: "Watch",
    summary: "Promising signals are present, but validate the gaps before scaling.",
  },
  skip: {
    label: "Skip",
    summary: "The current evidence does not justify launch effort yet.",
  },
};

function percent(value: number): string {
  return `${Math.round(Number.isFinite(value) ? value : 0)}%`;
}

function money(value: number): string {
  return PRICE_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

function sourceList(sources: readonly CrawlSource[]): string {
  return sources.map((source) => SOURCE_LABELS[source]).join(", ");
}

function finitePrices(card: TrendCard): number[] {
  return (card.competitors ?? [])
    .map((competitor) => competitor.price)
    .filter((price): price is number =>
      price !== undefined && Number.isFinite(price),
    )
    .sort((left, right) => left - right);
}

function describePriceWhitespace(card: TrendCard): string {
  const prices = finitePrices(card);
  if (prices.length < 2) {
    return "There is not enough competitor pricing to identify a price gap.";
  }

  let lower = prices[0];
  let upper = prices[1];
  let largestGap = upper - lower;

  for (let index = 2; index < prices.length; index += 1) {
    const gap = prices[index] - prices[index - 1];
    if (gap > largestGap) {
      lower = prices[index - 1];
      upper = prices[index];
      largestGap = gap;
    }
  }

  if (largestGap <= 0) {
    return "Observed competitor prices do not reveal a clear price gap.";
  }

  return `The largest observed price gap is ${money(largestGap)}, between ${money(lower)} and ${money(upper)}; test differentiated value in that range.`;
}

function buildWhyRising(insights: SellerInsights): string[] {
  const { demand } = insights;

  return [
    demand.growthPct === null
      ? "There is not enough trend history to calculate growth."
      : `Search interest changed ${percent(demand.growthPct)} from the first observation to the latest.`,
    demand.momentum === "unknown"
      ? "Momentum is unknown until at least three trend observations are available."
      : `Momentum is ${demand.momentum} based on second-half versus first-half slope.`,
    demand.peak === null || demand.currentVsPeakPct === null
      ? "No reliable peak or seasonality window is available yet."
      : `Peak interest is ${demand.peak.v} on ${demand.seasonalWindow}; current demand is ${percent(demand.currentVsPeakPct)} of that peak.`,
  ];
}

function buildMoneyAndCompetition(insights: SellerInsights): string[] {
  const { competition } = insights;

  return [
    competition.priceBand === null
      ? "No competitor pricing is available for a price-band estimate."
      : `Competitor prices run from ${money(competition.priceBand.min)} to ${money(competition.priceBand.max)}, with a ${money(competition.priceBand.median)} median.`,
    competition.activeAdRatio === null
      ? "No competitors were observed, so active-ad ratio is unavailable."
      : `${percent(competition.activeAdRatio * 100)} of observed competitors have active ads.`,
    competition.competitorCount === 0
      ? "No competitors were observed; saturation is unknown."
      : `${competition.competitorCount} competitors indicate ${competition.saturation} saturation.`,
    competition.provenIntent
      ? "Proven intent is present: Meta Ads is available and an active competitor ad was observed."
      : "Proven intent is not established from both Meta Ads coverage and an active competitor ad.",
  ];
}

function buildWhitespace(card: TrendCard, insights: SellerInsights): string[] {
  const { competition, confidence } = insights;

  return [
    confidence.missingSources.length === 0
      ? "No tracked source is currently flagged as a research gap."
      : `Validate ${sourceList(confidence.missingSources)} before scaling; these are the remaining source gaps.`,
    competition.activeAdRatio === null
      ? "Ad whitespace cannot be assessed without competitor observations."
      : competition.activeAdRatio < 0.5
        ? `Only ${percent(competition.activeAdRatio * 100)} of competitors are advertising, leaving room for a distinct paid creative angle.`
        : `${percent(competition.activeAdRatio * 100)} of competitors are advertising, so differentiate creative rather than relying on low ad pressure.`,
    describePriceWhitespace(card),
  ];
}

function buildRecommendedAction(
  card: TrendCard,
  insights: SellerInsights,
): string[] {
  const productType = card.productType?.trim() || "selected product";
  const seed = card.seed.trim() || "this opportunity";
  const action = card.recommendation.action.trim() || "Run a focused launch test";
  const reasoning =
    card.recommendation.reasoning.trim() ||
    "Use the strongest observed demand and competition signals.";

  return [
    `Product: start with a ${productType}.`,
    insights.competition.priceBand === null
      ? "Price: run a small price test because no competitor median is available."
      : `Price: test near the observed ${money(insights.competition.priceBand.median)} median.`,
    insights.demand.seasonalWindow === null
      ? "Launch timing: use current demand signals because no seasonal peak is available."
      : `Launch timing: aim to be live before the ${insights.demand.seasonalWindow} peak window.`,
    `Design angle for ${seed}: ${action}. ${reasoning}`,
  ];
}

function buildConfidenceAndCaveats(
  card: TrendCard,
  insights: SellerInsights,
): string[] {
  const availableCount = card.availableSources.length;
  const missingCount = insights.confidence.missingSources.length;
  const sourceStatus =
    availableCount + missingCount === 0
      ? "No source status was reported; treat conclusions as directional."
      : missingCount === 0
        ? "No sources are currently flagged missing."
        : `Missing sources: ${sourceList(insights.confidence.missingSources)}.`;

  return [
    `Source coverage is ${percent(insights.confidence.sourceCoveragePct)} (${availableCount} available, ${missingCount} missing).`,
    `Freshness is ${insights.confidence.freshnessTier}; overall confidence is ${percent(insights.confidence.confidencePct)}.`,
    sourceStatus,
  ];
}

export function buildOpportunityReport(
  card: TrendCard,
  insights: SellerInsights,
): OpportunityReport {
  const verdict = VERDICT_COPY[insights.verdict];
  const score = Math.round(
    Number.isFinite(card.opportunityScore) ? card.opportunityScore : 0,
  );

  return {
    verdictTldr: `${score}/100 · ${verdict.label} — ${verdict.summary}`,
    whyRising: buildWhyRising(insights),
    moneyAndCompetition: buildMoneyAndCompetition(insights),
    whitespace: buildWhitespace(card, insights),
    recommendedAction: buildRecommendedAction(card, insights),
    confidenceAndCaveats: buildConfidenceAndCaveats(card, insights),
  };
}
