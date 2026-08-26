import { CACHE_SIM_THRESHOLD } from "../../packages/config/cache.config";
import type { CrawlRequest } from "../../packages/contracts";
import type {
  CacheDecisionResult,
  CacheKey,
  MaDeepDive,
} from "./cache-types";
import type { TrendCardRepository } from "./trend-card-repository";

interface CacheDecisionDependencies {
  repository: TrendCardRepository;
  ma: MaDeepDive;
}

export async function resolveTrendCard(
  request: CrawlRequest,
  dependencies: CacheDecisionDependencies,
): Promise<CacheDecisionResult> {
  const key: CacheKey = {
    market: request.market,
    seed: request.seed.trim().toLowerCase(),
    productType: request.productType,
  };

  const exact = await dependencies.repository.findExact(key);
  if (exact) {
    return { kind: "exact", card: exact };
  }

  const semantic = await dependencies.repository.findSimilar(key);
  if (semantic && semantic.similarity >= CACHE_SIM_THRESHOLD) {
    return { kind: "semantic", card: semantic.card };
  }

  const card = await dependencies.ma.run(request);
  return { kind: "miss", card };
}
