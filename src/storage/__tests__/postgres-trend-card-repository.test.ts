import { describe, expect, it } from "vitest";

import type { TrendCard } from "../../../packages/contracts";
import {
  PostgresTrendCardRepository,
  type EmbeddingProvider,
  type QueryExecutor,
  type QueryResult,
} from "../postgres-trend-card-repository";

const DATABASE_ROW = {
  id: "card-postgres",
  market: "US",
  seed: "retro halloween cat",
  product_type: "t-shirt",
  opportunity_score: 82,
  confidence: 0.91,
  available_sources: ["google_trends", "reddit", "amazon"],
  missing_sources: ["pinterest", "tiktok", "etsy", "meta_ads"],
  trend_series: [{ t: "2026-08-25", v: 72 }],
  reference_images: ["tos://trend-cards/retro-halloween-cat.png"],
  competitors: [{ title: "Retro Cat Shirt", price: 24.99, adActive: true }],
  recommendation: {
    action: "Test a small seasonal collection",
    reasoning: "Demand is accelerating before the seasonal peak.",
  },
  freshness_tier: "hot",
  updated_at: new Date("2026-08-26T00:00:00.000Z"),
};

const EXPECTED_CARD: TrendCard = {
  id: "card-postgres",
  market: "US",
  seed: "retro halloween cat",
  productType: "t-shirt",
  opportunityScore: 82,
  confidence: 0.91,
  availableSources: ["google_trends", "reddit", "amazon"],
  missingSources: ["pinterest", "tiktok", "etsy", "meta_ads"],
  trendSeries: [{ t: "2026-08-25", v: 72 }],
  referenceImages: ["tos://trend-cards/retro-halloween-cat.png"],
  competitors: [{ title: "Retro Cat Shirt", price: 24.99, adActive: true }],
  recommendation: {
    action: "Test a small seasonal collection",
    reasoning: "Demand is accelerating before the seasonal peak.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

interface QueryCall {
  sql: string;
  parameters: readonly unknown[];
}

class MockQueryExecutor implements QueryExecutor {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rows: unknown[]) {}

  async query<Row>(
    sql: string,
    parameters: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.calls.push({ sql, parameters });
    return { rows: this.rows as Row[] };
  }
}

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly calls: string[] = [];

  constructor(private readonly embedding: readonly number[]) {}

  async embed(seed: string): Promise<readonly number[]> {
    this.calls.push(seed);
    return this.embedding;
  }
}

describe("PostgresTrendCardRepository", () => {
  it("performs a parameterized exact lookup and maps the row", async () => {
    const executor = new MockQueryExecutor([DATABASE_ROW]);
    const embeddings = new MockEmbeddingProvider([0.1, 0.2]);
    const repository = new PostgresTrendCardRepository(executor, embeddings);

    const result = await repository.findExact({
      market: "US",
      seed: "  ReTrO HaLLoWeeN CaT  ",
      productType: "t-shirt",
    });

    expect(result).toEqual(EXPECTED_CARD);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].parameters).toEqual([
      "US",
      "retro halloween cat",
      "t-shirt",
    ]);
    expect(executor.calls[0].sql).toContain("market = $1");
    expect(executor.calls[0].sql).toContain("lower(btrim(seed)) = $2");
    expect(executor.calls[0].sql).toContain(
      "product_type IS NOT DISTINCT FROM $3",
    );
    expect(executor.calls[0].sql).not.toContain("retro halloween cat");
    expect(executor.calls[0].sql).not.toContain("t-shirt");
    expect(embeddings.calls).toHaveLength(0);
  });

  it("returns null when the exact query has no rows", async () => {
    const executor = new MockQueryExecutor([]);
    const embeddings = new MockEmbeddingProvider([0.1, 0.2]);
    const repository = new PostgresTrendCardRepository(executor, embeddings);

    const result = await repository.findExact({
      market: "US",
      seed: "retro halloween cat",
      productType: undefined,
    });

    expect(result).toBeNull();
    expect(executor.calls[0].parameters).toEqual([
      "US",
      "retro halloween cat",
      null,
    ]);
  });

  it("performs a scoped pgvector lookup and maps cosine similarity", async () => {
    const executor = new MockQueryExecutor([
      { ...DATABASE_ROW, product_type: null, similarity: 0.91 },
    ]);
    const embeddings = new MockEmbeddingProvider([0.1, -0.2, 0.3]);
    const repository = new PostgresTrendCardRepository(executor, embeddings);

    const result = await repository.findSimilar({
      market: "US",
      seed: "  Vintage Halloween Cats  ",
      productType: undefined,
    });

    expect(result).toEqual({
      card: { ...EXPECTED_CARD, productType: undefined },
      similarity: 0.91,
    });
    expect(embeddings.calls).toEqual(["vintage halloween cats"]);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].parameters).toEqual([
      "US",
      null,
      "[0.1,-0.2,0.3]",
    ]);
    expect(executor.calls[0].sql).toContain("market = $1");
    expect(executor.calls[0].sql).toContain(
      "product_type IS NOT DISTINCT FROM $2",
    );
    expect(executor.calls[0].sql).toContain(
      "1 - (embedding <=> $3::vector) AS similarity",
    );
    expect(executor.calls[0].sql).toContain(
      "ORDER BY embedding <=> $3::vector ASC",
    );
    expect(executor.calls[0].sql).toContain("LIMIT 1");
    expect(executor.calls[0].sql).not.toContain("vintage halloween cats");
  });

  it("returns null when the semantic query has no rows", async () => {
    const executor = new MockQueryExecutor([]);
    const embeddings = new MockEmbeddingProvider([0.1, 0.2]);
    const repository = new PostgresTrendCardRepository(executor, embeddings);

    const result = await repository.findSimilar({
      market: "DE",
      seed: "bauhaus poster",
      productType: "poster",
    });

    expect(result).toBeNull();
  });
});
