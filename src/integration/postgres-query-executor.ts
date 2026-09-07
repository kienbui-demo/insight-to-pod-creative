import type { QueryExecutor } from "../storage/postgres-trend-card-repository";

interface QueryPool {
  query(
    sql: string,
    parameters: readonly unknown[],
  ): Promise<{ rows: unknown[] }>;
}

export function createPostgresQueryExecutor(pool: QueryPool): QueryExecutor {
  return {
    async query<Row>(sql: string, parameters: readonly unknown[]) {
      return (await pool.query(sql, parameters)) as { rows: Row[] };
    },
  };
}
