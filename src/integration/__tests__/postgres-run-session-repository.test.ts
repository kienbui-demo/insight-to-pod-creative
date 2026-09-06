import { describe, expect, it } from "vitest";

import type { RunSessionMapping } from "../../../packages/contracts";
import { PostgresRunSessionRepository } from "../postgres-run-session-repository";
import type {
  QueryExecutor,
  QueryResult,
} from "../../storage/postgres-trend-card-repository";

const MAPPING: RunSessionMapping = {
  runId: "run-postgres",
  maSessionId: "ma-session-postgres",
  createdAt: "2026-09-06T01:00:00.000Z",
  updatedAt: "2026-09-06T02:00:00.000Z",
};

const DATABASE_ROW = {
  run_id: MAPPING.runId,
  ma_session_id: MAPPING.maSessionId,
  created_at: new Date(MAPPING.createdAt),
  updated_at: new Date(MAPPING.updatedAt),
};

interface QueryCall {
  sql: string;
  parameters: readonly unknown[];
}

class MockQueryExecutor implements QueryExecutor {
  readonly calls: QueryCall[] = [];

  constructor(private readonly presetRows: unknown[][]) {}

  async query<Row>(
    sql: string,
    parameters: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.calls.push({ sql, parameters });
    return { rows: (this.presetRows.shift() ?? []) as Row[] };
  }
}

describe("PostgresRunSessionRepository", () => {
  it("findByRunId returns null when no row", async () => {
    const executor = new MockQueryExecutor([[]]);
    const repository = new PostgresRunSessionRepository(executor);

    await expect(repository.findByRunId("missing-run")).resolves.toBeNull();

    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].sql).toContain("FROM ma_run_sessions");
    expect(executor.calls[0].sql).toContain("WHERE run_id = $1");
    expect(executor.calls[0].parameters).toEqual(["missing-run"]);
    expect(executor.calls[0].sql).not.toContain("missing-run");
  });

  it("findByRunId maps Date fields via toISOString", async () => {
    const executor = new MockQueryExecutor([[DATABASE_ROW]]);
    const repository = new PostgresRunSessionRepository(executor);

    await expect(repository.findByRunId(MAPPING.runId)).resolves.toEqual(
      MAPPING,
    );
  });

  it("saveIfAbsent inserts without replacing then selects the canonical mapping", async () => {
    const executor = new MockQueryExecutor([[], [DATABASE_ROW]]);
    const repository = new PostgresRunSessionRepository(executor);

    const result = await repository.saveIfAbsent({
      runId: MAPPING.runId,
      maSessionId: MAPPING.maSessionId,
    });

    expect(result).toEqual(MAPPING);
    expect(executor.calls).toHaveLength(2);
    expect(executor.calls[0].sql).toContain("INSERT INTO ma_run_sessions");
    expect(executor.calls[0].sql).toContain("(run_id, ma_session_id)");
    expect(executor.calls[0].sql).toContain("VALUES ($1, $2)");
    expect(executor.calls[0].sql).toContain(
      "ON CONFLICT (run_id) DO NOTHING",
    );
    expect(executor.calls[0].parameters).toEqual([
      MAPPING.runId,
      MAPPING.maSessionId,
    ]);
    expect(executor.calls[1].sql).toContain("FROM ma_run_sessions");
    expect(executor.calls[1].sql).toContain("WHERE run_id = $1");
    expect(executor.calls[1].parameters).toEqual([MAPPING.runId]);
  });

  it("saveIfAbsent returns the existing mapping on conflict", async () => {
    const existingRow = {
      ...DATABASE_ROW,
      ma_session_id: "ma-session-existing",
    };
    const executor = new MockQueryExecutor([[], [existingRow]]);
    const repository = new PostgresRunSessionRepository(executor);

    const result = await repository.saveIfAbsent({
      runId: MAPPING.runId,
      maSessionId: "ma-session-competing",
    });

    expect(result).toEqual({
      ...MAPPING,
      maSessionId: "ma-session-existing",
    });
    expect(executor.calls[0].parameters).toEqual([
      MAPPING.runId,
      "ma-session-competing",
    ]);
    expect(executor.calls[1].parameters).toEqual([MAPPING.runId]);
  });
});
