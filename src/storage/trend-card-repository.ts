import type { TrendCard } from "../../packages/contracts";
import type { CacheKey, SimilarityMatch } from "./cache-types";

export interface TrendCardRepository {
  findExact(key: CacheKey): Promise<TrendCard | null>;
  findSimilar(key: CacheKey): Promise<SimilarityMatch | null>;
}
