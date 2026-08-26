import type { TrendCard } from "../../packages/contracts";
import type { CacheKey, SimilarityMatch } from "./cache-types";
import type { TrendCardRepository } from "./trend-card-repository";

export interface QueryResult<Row> {
  rows: Row[];
}

export interface QueryExecutor {
  query<Row>(
    sql: string,
    parameters: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface EmbeddingProvider {
  embed(seed: string): Promise<readonly number[]>;
}

interface TrendCardRow {
  id: string;
  market: string;
  seed: string;
  product_type: string | null;
  opportunity_score: number;
  confidence: number;
  available_sources: TrendCard["availableSources"];
  missing_sources: TrendCard["missingSources"];
  trend_series: TrendCard["trendSeries"];
  reference_images: TrendCard["referenceImages"];
  competitors: TrendCard["competitors"] | null;
  recommendation: TrendCard["recommendation"];
  freshness_tier: TrendCard["freshnessTier"];
  updated_at: Date | string;
}

interface SimilarTrendCardRow extends TrendCardRow {
  similarity: number;
}

const CARD_COLUMNS = `
  id,
  market,
  seed,
  product_type,
  opportunity_score,
  confidence,
  available_sources,
  missing_sources,
  trend_series,
  reference_images,
  competitors,
  recommendation,
  freshness_tier,
  updated_at
`;

function mapTrendCard(row: TrendCardRow): TrendCard {
  return {
    id: row.id,
    market: row.market,
    seed: row.seed,
    productType: row.product_type ?? undefined,
    opportunityScore: row.opportunity_score,
    confidence: row.confidence,
    availableSources: row.available_sources,
    missingSources: row.missing_sources,
    trendSeries: row.trend_series,
    referenceImages: row.reference_images,
    competitors: row.competitors ?? undefined,
    recommendation: row.recommendation,
    freshnessTier: row.freshness_tier,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}

export class PostgresTrendCardRepository implements TrendCardRepository {
  constructor(
    private readonly executor: QueryExecutor,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async findExact(key: CacheKey): Promise<TrendCard | null> {
    const result = await this.executor.query<TrendCardRow>(
      `SELECT ${CARD_COLUMNS}
       FROM trend_cards
       WHERE market = $1
         AND lower(btrim(seed)) = $2
         AND product_type IS NOT DISTINCT FROM $3
       ORDER BY updated_at DESC
       LIMIT 1`,
      [
        key.market,
        key.seed.trim().toLowerCase(),
        key.productType ?? null,
      ],
    );

    return result.rows[0] ? mapTrendCard(result.rows[0]) : null;
  }

  async findSimilar(key: CacheKey): Promise<SimilarityMatch | null> {
    const normalizedSeed = key.seed.trim().toLowerCase();
    const embedding = await this.embeddings.embed(normalizedSeed);
    const result = await this.executor.query<SimilarTrendCardRow>(
      `SELECT ${CARD_COLUMNS},
              1 - (embedding <=> $3::vector) AS similarity
       FROM trend_cards
       WHERE market = $1
         AND product_type IS NOT DISTINCT FROM $2
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $3::vector ASC
       LIMIT 1`,
      [key.market, key.productType ?? null, JSON.stringify(embedding)],
    );
    const row = result.rows[0];

    return row
      ? { card: mapTrendCard(row), similarity: row.similarity }
      : null;
  }
}
