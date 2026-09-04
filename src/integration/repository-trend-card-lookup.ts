import { CACHE_SIM_THRESHOLD } from "../../packages/config/cache.config";
import type { CrawlRequest } from "../../packages/contracts";
import type {
  TrendCardLookupPort,
  TrendCardLookupResult,
} from "../bff/types";
import type { CacheKey, SimilarityMatch } from "../storage/cache-types";
import type { TrendCardRepository } from "../storage/trend-card-repository";

export function createRepositoryTrendCardLookup(
  repository: TrendCardRepository,
): TrendCardLookupPort {
  return {
    async lookup(request: CrawlRequest): Promise<TrendCardLookupResult> {
      const key = {
        market: request.market,
        seed: request.seed.trim().toLowerCase(),
        productType: request.productType,
      } satisfies CacheKey;

      const exact = await repository.findExact(key);
      if (exact !== null) {
        return { kind: "hit", card: exact };
      }

      const similar: SimilarityMatch | null =
        await repository.findSimilar(key);
      return similar !== null && similar.similarity >= CACHE_SIM_THRESHOLD
        ? { kind: "hit", card: similar.card }
        : { kind: "miss" };
    },
  };
}
