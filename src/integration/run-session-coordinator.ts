import type {
  RunSessionMapping,
  RunSessionRepository,
} from "../../packages/contracts";

interface ResolveRunSessionOptions {
  runId: string;
  repository: RunSessionRepository;
  createMaSession(): Promise<string>;
}

export async function resolveRunSession(
  options: ResolveRunSessionOptions,
): Promise<RunSessionMapping> {
  const existing = await options.repository.findByRunId(options.runId);
  if (existing) {
    return existing;
  }

  const maSessionId = await options.createMaSession();
  return options.repository.saveIfAbsent({
    runId: options.runId,
    maSessionId,
  });
}
