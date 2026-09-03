import type {
  CreateRunSessionMapping,
  RunSessionMapping,
  RunSessionRepository,
} from "../../packages/contracts";

export class InMemoryRunSessionRepository implements RunSessionRepository {
  private readonly mappings = new Map<string, RunSessionMapping>();

  async findByRunId(runId: string): Promise<RunSessionMapping | null> {
    return this.mappings.get(runId) ?? null;
  }

  async saveIfAbsent(
    input: CreateRunSessionMapping,
  ): Promise<RunSessionMapping> {
    const stored = this.mappings.get(input.runId);
    if (stored !== undefined) {
      return stored;
    }

    const timestamp = new Date().toISOString();
    const mapping: RunSessionMapping = {
      runId: input.runId,
      maSessionId: input.maSessionId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.mappings.set(input.runId, mapping);
    return mapping;
  }
}
