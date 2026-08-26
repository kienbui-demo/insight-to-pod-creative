import type { CrawlRequest, TrendCard } from "../../packages/contracts";

export interface CacheKey {
  market: string;
  seed: string;
  productType: string | undefined;
}

export interface SimilarityMatch {
  card: TrendCard;
  similarity: number;
}

export type CacheDecisionResult =
  | { kind: "exact"; card: TrendCard }
  | { kind: "semantic"; card: TrendCard }
  | { kind: "miss"; card: TrendCard };

export interface MaDeepDive {
  run(request: CrawlRequest): Promise<TrendCard>;
}
