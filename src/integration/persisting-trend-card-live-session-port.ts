import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../bff/types";
import type { EmbeddingProvider } from "../storage/postgres-trend-card-repository";
import type { TrendCardRepository } from "../storage/trend-card-repository";

interface CreatePersistingTrendCardSessionPortOptions {
  inner: LiveSessionPort;
  repository: Pick<TrendCardRepository, "save">;
  embeddings: EmbeddingProvider;
}

export function createPersistingTrendCardSessionPort(
  options: CreatePersistingTrendCardSessionPortOptions,
): LiveSessionPort {
  return {
    async create(runId: string): Promise<LiveRun> {
      const innerRun = await options.inner.create(runId);
      let lastRequest: BffRequest | undefined;
      let saved = false;

      return {
        history: () => innerRun.history(),
        async *openEvents(signal?: AbortSignal): AsyncIterable<RawMaEvent> {
          for await (const event of innerRun.openEvents(signal)) {
            if (
              !saved &&
              event.type === "final_card" &&
              lastRequest?.kind === "trend-card"
            ) {
              saved = true;
              const card = event.card;
              const normalizedSeed = card.seed.trim().toLowerCase();
              let embedding: readonly number[] | undefined;
              try {
                embedding = await options.embeddings.embed(normalizedSeed);
              } catch {
                embedding = undefined;
              }
              try {
                await options.repository.save(card, embedding);
              } catch {
                // Persistence is best-effort and must not interrupt MA events.
              }
            }

            yield event;
          }
        },
        async send(request: BffRequest): Promise<void> {
          lastRequest = request;
          await innerRun.send(request);
        },
        cancel:
          innerRun.cancel === undefined
            ? undefined
            : (reason?: unknown) => innerRun.cancel?.(reason),
      };
    },
  };
}
