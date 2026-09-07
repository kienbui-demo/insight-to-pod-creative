import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../bff/types";
import type { SellerProjectRepository } from "../storage/seller-project-repository";

interface CreatePersistingLiveSessionPortOptions {
  inner: LiveSessionPort;
  projects: SellerProjectRepository;
  sellerId: string;
}

export function createPersistingLiveSessionPort(
  options: CreatePersistingLiveSessionPortOptions,
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
              event.type === "seedream_image" &&
              lastRequest?.kind === "generate-design"
            ) {
              saved = true;
              try {
                await options.projects.save({
                  id: runId,
                  sellerId: options.sellerId,
                  market: lastRequest.crawl.market,
                  seed: lastRequest.crawl.seed,
                  productType: lastRequest.crawl.productType,
                  designAssetUrl: event.url,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
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
