import type { CrawlRequest, CrawlSource } from "./crawl";

export interface CanonicalRecord {
  source: CrawlSource;
  market: string;
  seed: string;
  capturedAt: string;
  signalType: "demand" | "culture" | "ad" | "price" | "competition";
  payload: Record<string, unknown>;
  rawRef?: string;
}

export interface SourceAdapter {
  source: CrawlSource;
  adapt(req: CrawlRequest): unknown;
  normalize(providerOutput: unknown): CanonicalRecord[];
}
