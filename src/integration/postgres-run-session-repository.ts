import type {
  CreateRunSessionMapping,
  RunSessionMapping,
  RunSessionRepository,
} from "../../packages/contracts";
import type { QueryExecutor } from "../storage/postgres-trend-card-repository";

interface RunSessionRow {
  run_id: string;
  ma_session_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const SELECT_BY_RUN_ID = `SELECT
  run_id,
  ma_session_id,
  created_at,
  updated_at
FROM ma_run_sessions
WHERE run_id = $1`;

export class PostgresRunSessionRepository
  implements RunSessionRepository
{
  constructor(private readonly executor: QueryExecutor) {}

  async findByRunId(runId: string): Promise<RunSessionMapping | null> {
    const result = await this.executor.query<RunSessionRow>(
      SELECT_BY_RUN_ID,
      [runId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async saveIfAbsent(
    input: CreateRunSessionMapping,
  ): Promise<RunSessionMapping> {
    await this.executor.query(
      `INSERT INTO ma_run_sessions (run_id, ma_session_id)
       VALUES ($1, $2)
       ON CONFLICT (run_id) DO NOTHING`,
      [input.runId, input.maSessionId],
    );

    const mapping = await this.findByRunId(input.runId);
    if (mapping === null) {
      throw new Error(
        `Run session mapping was not found after save: ${input.runId}`,
      );
    }

    return mapping;
  }

  private mapRow(row: RunSessionRow): RunSessionMapping {
    return {
      runId: row.run_id,
      maSessionId: row.ma_session_id,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
  }
}
