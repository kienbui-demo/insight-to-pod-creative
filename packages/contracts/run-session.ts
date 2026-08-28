export interface RunSessionMapping {
  runId: string;
  maSessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunSessionMapping {
  runId: string;
  maSessionId: string;
}

export interface RunSessionRepository {
  findByRunId(runId: string): Promise<RunSessionMapping | null>;
  /**
   * Persists the mapping only when runId is absent and returns the canonical
   * stored mapping when a competing caller has already created it.
   */
  saveIfAbsent(input: CreateRunSessionMapping): Promise<RunSessionMapping>;
}
