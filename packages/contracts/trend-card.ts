import type { CrawlSource } from "./crawl";

export interface TrendCard {
  id: string;
  market: string;
  seed: string;
  productType?: string;
  opportunityScore: number;
  confidence: number;
  availableSources: CrawlSource[];
  missingSources: CrawlSource[];
  trendSeries: { t: string; v: number }[];
  referenceImages: string[];
  competitors?: { title: string; price?: number; adActive?: boolean }[];
  recommendation: { action: string; reasoning: string };
  freshnessTier: "hot" | "warm" | "cold";
  updatedAt: string;
}
