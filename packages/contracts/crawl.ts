export type CrawlSource =
  | "google_trends"
  | "reddit"
  | "pinterest"
  | "tiktok"
  | "amazon"
  | "etsy"
  | "meta_ads";

export interface CrawlRequest {
  source: CrawlSource;
  market: string;
  seed: string;
  productType?: string;
  window?: { from: string; to: string };
  limit?: number;
  mode: "batch" | "live";
}
