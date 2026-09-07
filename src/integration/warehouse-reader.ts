import { Pool } from "pg";

import type { TrendCard } from "../../packages/contracts";
import {
  PostgresTrendCardRepository,
  type EmbeddingProvider,
} from "../storage/postgres-trend-card-repository";
import { createPostgresQueryExecutor } from "./postgres-query-executor";

export interface WarehouseReader {
  listRecent(limit: number): Promise<TrendCard[]>;
  findById(id: string): Promise<TrendCard | null>;
}

const stubEmbeddings: EmbeddingProvider = {
  async embed() {
    return [];
  },
};

export function buildWarehouseReader(
  env: NodeJS.ProcessEnv = process.env,
): WarehouseReader | null {
  const connectionString = env.DATABASE_URL;
  if (!connectionString || connectionString.trim().length === 0) {
    return null;
  }

  const pool = new Pool({ connectionString });
  const executor = createPostgresQueryExecutor(pool);
  const repository = new PostgresTrendCardRepository(
    executor,
    stubEmbeddings,
  );

  return {
    listRecent(limit) {
      return repository.listRecent(limit);
    },
    findById(id) {
      return repository.findById(id);
    },
  };
}
