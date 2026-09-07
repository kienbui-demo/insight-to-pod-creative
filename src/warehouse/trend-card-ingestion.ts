import type { TrendCard } from "../../packages/contracts";
import type { EmbeddingProvider } from "../storage/postgres-trend-card-repository";
import type { TrendCardRepository } from "../storage/trend-card-repository";
import { buildTrendCard } from "./trend-card-builder";
import type { WarehouseBuildInput, WarehouseBuilderDependencies } from "./types";

export interface TrendCardIngestionDependencies {
  readonly warehouse: WarehouseBuilderDependencies;
  readonly embeddings: EmbeddingProvider;
  readonly repository: Pick<TrendCardRepository, "save">;
}

export async function ingestTrendCard(
  input: WarehouseBuildInput,
  dependencies: TrendCardIngestionDependencies,
): Promise<TrendCard> {
  const card = await buildTrendCard(input, dependencies.warehouse);
  const normalizedSeed = card.seed.trim().toLowerCase();
  let embedding: readonly number[] | undefined;

  try {
    embedding = await dependencies.embeddings.embed(normalizedSeed);
  } catch {
    embedding = undefined;
  }

  await dependencies.repository.save(card, embedding);
  return card;
}
