import type { CrawlSource } from "../../packages/contracts";

const SOURCE_LABELS: Record<CrawlSource, string> = {
  google_trends: "Google Trends",
  reddit: "Reddit",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  amazon: "Amazon",
  etsy: "Etsy",
  meta_ads: "Meta Ads",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const PRICE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCrawlSource(source: CrawlSource): string {
  return SOURCE_LABELS[source];
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatOpportunityScore(score: number): string {
  return `${Math.round(score)}/100`;
}

export function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value));
}

export function formatCompetitorPrice(price?: number): string | null {
  return price === undefined ? null : PRICE_FORMATTER.format(price);
}
