import type { CanonicalRecord } from "../../packages/contracts";
import type { CrawlPort } from "../agent/ports";
import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../bff/types";
import { scoreOpportunity } from "../scoring/opportunity-score";
import {
  ALL_CRAWL_SOURCES,
  reduceOpportunityComponents,
} from "../warehouse/component-reducer";

export function createRescoringLiveSessionPort(options: {
  inner: LiveSessionPort;
  crawl: CrawlPort;
}): LiveSessionPort {
  return {
    async create(runId: string): Promise<LiveRun> {
      const innerRun = await options.inner.create(runId);
      let lastRequest: BffRequest | undefined;
      let rescored = false;

      return {
        history: () => innerRun.history(),
        async *openEvents(signal?: AbortSignal): AsyncIterable<RawMaEvent> {
          for await (const event of innerRun.openEvents(signal)) {
            if (
              !rescored &&
              event.type === "final_card" &&
              lastRequest?.kind === "trend-card"
            ) {
              rescored = true;
              try {
                const card = event.card;
                const results = await Promise.allSettled(
                  ALL_CRAWL_SOURCES.map((source) =>
                    options.crawl.fetch({
                      source,
                      market: card.market,
                      seed: card.seed,
                      productType: card.productType,
                    }),
                  ),
                );
                const records: CanonicalRecord[] = [];

                for (const result of results) {
                  if (result.status === "fulfilled" && result.value.ok) {
                    records.push(...result.value.records);
                  }
                }

                const reduction = reduceOpportunityComponents(records);
                const contributing = new Set(
                  reduction.contributingSources,
                );
                const availableSources = ALL_CRAWL_SOURCES.filter((source) =>
                  contributing.has(source),
                );
                const missingSources = ALL_CRAWL_SOURCES.filter(
                  (source) => !contributing.has(source),
                );

                if (availableSources.length > 0) {
                  const scoring = scoreOpportunity({
                    components: reduction.components,
                    availableSources,
                    missingSources,
                  });

                  yield {
                    ...event,
                    card: {
                      ...card,
                      opportunityScore: scoring.opportunityScore,
                      confidence: scoring.confidence,
                      availableSources,
                      missingSources,
                    },
                  };
                  continue;
                }
              } catch {
                // Rescoring is best-effort and must not interrupt MA events.
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
