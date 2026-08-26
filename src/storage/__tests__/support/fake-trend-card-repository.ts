import type { TrendCard } from "../../../../packages/contracts";

export interface FakeCacheKey {
  market: string;
  seed: string;
  productType?: string;
}

export interface FakeSimilarityMatch {
  card: TrendCard;
  similarity: number;
}

interface FakeRepositoryAnswers {
  exact?: TrendCard | null;
  similar?: FakeSimilarityMatch | null;
}

export class FakeTrendCardRepository {
  readonly findExactCalls: FakeCacheKey[] = [];
  readonly findSimilarCalls: FakeCacheKey[] = [];

  constructor(private readonly answers: FakeRepositoryAnswers = {}) {}

  async findExact(key: FakeCacheKey): Promise<TrendCard | null> {
    this.findExactCalls.push(key);
    return this.answers.exact ?? null;
  }

  async findSimilar(key: FakeCacheKey): Promise<FakeSimilarityMatch | null> {
    this.findSimilarCalls.push(key);
    return this.answers.similar ?? null;
  }
}
