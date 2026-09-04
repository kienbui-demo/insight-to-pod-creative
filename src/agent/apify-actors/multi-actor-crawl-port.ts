import type { CrawlSource } from "../../../packages/contracts";
import {
  createApifyCrawlPort,
  type ApifyActorEntry,
} from "../apify-crawl-port";
import type {
  CrawlPort,
  CrawlPortInput,
  CrawlPortResult,
} from "../ports";

export type ApifyActorRegistry = Partial<
  Record<CrawlSource, readonly ApifyActorEntry[]>
>;

export function createMultiActorCrawlPort(options: {
  token: string;
  baseUrl: string;
  registry: ApifyActorRegistry;
  fetch?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  timeoutMs?: number;
}): CrawlPort {
  return {
    async fetch(
      input: CrawlPortInput,
      signal?: AbortSignal,
    ): Promise<CrawlPortResult> {
      const entries = options.registry[input.source]?.filter(
        (entry) => entry.enabled,
      );
      if (entries === undefined || entries.length === 0) {
        return {
          ok: false,
          recoverable: false,
          message: `No enabled Apify actor for source ${input.source}.`,
        };
      }

      const mergedRecords: Array<
        Extract<CrawlPortResult, { ok: true }>["records"][number]
      > = [];
      for (const entry of entries) {
        const singleEntryRegistry = { [input.source]: entry };
        const actorPort = createApifyCrawlPort({
          token: options.token,
          baseUrl: options.baseUrl,
          registry: singleEntryRegistry,
          fetch: options.fetch,
          timeoutMs: options.timeoutMs,
        });
        const result = await actorPort.fetch(input, signal);
        if (!result.ok) {
          return result;
        }
        mergedRecords.push(...result.records);
      }

      return { ok: true, records: mergedRecords };
    },
  };
}
