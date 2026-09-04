import type { TrendCard } from "../../packages/contracts";
import type { CacheKey, SimilarityMatch } from "./cache-types";

export interface TrendCardRepository {
  listRecent(limit: number): Promise<TrendCard[]>;
  findById(id: string): Promise<TrendCard | null>;
  findExact(key: CacheKey): Promise<TrendCard | null>;
  findSimilar(key: CacheKey): Promise<SimilarityMatch | null>;
}
