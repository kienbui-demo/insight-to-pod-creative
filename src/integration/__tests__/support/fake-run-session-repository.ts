import type {
  CreateRunSessionMapping,
  RunSessionMapping,
  RunSessionRepository,
} from "../../../../packages/contracts";

const FIXED_TIMESTAMP = "2026-08-28T05:45:00.000Z";

export class InMemoryRunSessionRepository implements RunSessionRepository {
  private readonly mappings = new Map<string, RunSessionMapping>();

  async findByRunId(runId: string): Promise<RunSessionMapping | null> {
    return this.mappings.get(runId) ?? null;
  }

  async saveIfAbsent(
    input: CreateRunSessionMapping,
  ): Promise<RunSessionMapping> {
    const existing = this.mappings.get(input.runId);
    if (existing) {
      return existing;
    }

    const mapping: RunSessionMapping = {
      ...input,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    };
    this.mappings.set(input.runId, mapping);
    return mapping;
  }
}
