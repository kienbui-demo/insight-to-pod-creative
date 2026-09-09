import type {
  CanonicalRecord,
  CrawlRequest,
  CrawlSource,
  MetricSink,
  SourceAdapter,
} from "../../packages/contracts";
import type { CrawlPort, CrawlPortResult } from "../agent/ports";
import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../bff/types";
import { writeStructuredLog } from "../monitoring/console-log-sink";
import {
  ALL_CRAWL_SOURCES,
  reduceOpportunityComponents,
} from "../warehouse/component-reducer";
import { buildTrendCard } from "../warehouse/trend-card-builder";
import type {
  Clock,
  RecommendationPort,
  WarehouseBuilderDependencies,
} from "../warehouse/types";

interface CreateSynthesizingTrendCardLiveSessionPortOptions {
  inner: LiveSessionPort;
  crawl: CrawlPort;
  clock?: Clock;
  recommendation?: RecommendationPort;
  metricSink?: MetricSink;
}

interface CanonicalRecordBatch {
  records: readonly CanonicalRecord[];
}

function isCanonicalRecordBatch(
  value: unknown,
): value is CanonicalRecordBatch {
  return (
    typeof value === "object" &&
    value !== null &&
    "records" in value &&
    Array.isArray(value.records)
  );
}

function identityAdapter(source: CrawlSource): SourceAdapter {
  return {
    source,
    adapt(request: CrawlRequest): unknown {
      return request;
    },
    normalize(providerOutput: unknown): CanonicalRecord[] {
      if (!isCanonicalRecordBatch(providerOutput)) {
        throw new Error(`Invalid prefetched crawl records for ${source}`);
      }
      return [...providerOutput.records];
    },
  };
}

const IDENTITY_ADAPTERS: Readonly<Record<CrawlSource, SourceAdapter>> = {
  google_trends: identityAdapter("google_trends"),
  reddit: identityAdapter("reddit"),
  pinterest: identityAdapter("pinterest"),
  tiktok: identityAdapter("tiktok"),
  amazon: identityAdapter("amazon"),
  etsy: identityAdapter("etsy"),
  meta_ads: identityAdapter("meta_ads"),
};

const SYSTEM_CLOCK: Clock = {
  nowIso: () => new Date().toISOString(),
};

const DETERMINISTIC_RECOMMENDATION: RecommendationPort = {
  async recommend(context) {
    const verdict =
      context.opportunityScore >= 75
        ? "Act now"
        : context.opportunityScore >= 50
          ? "Watch"
          : "Skip";
    const seed = context.request.seed.trim() || "this opportunity";
    const productType =
      context.request.productType?.trim() || "selected product";
    const market = context.request.market.trim() || "selected market";
    const missingSummary =
      context.missingSources.length === 0
        ? "no tracked sources are missing."
        : `missing sources: ${context.missingSources.join(", ")}.`;

    return {
      action: `${verdict}: test "${seed}" on ${productType} in ${market}.`,
      reasoning: `${Math.round(context.opportunityScore)}/100 opportunity with ${Math.round(context.confidence * 100)}% confidence from ${context.availableSources.length}/${ALL_CRAWL_SOURCES.length} tracked sources; ${missingSummary}`,
    };
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function crawlInput(request: CrawlRequest, source: CrawlSource) {
  return {
    source,
    market: request.market,
    seed: request.seed,
    productType: request.productType,
    window: request.window,
    limit: request.limit,
  };
}

async function synthesizeTrendCard(options: {
  runId: string;
  request: CrawlRequest;
  crawl: CrawlPort;
  signal?: AbortSignal;
  clock: Clock;
  recommendation: RecommendationPort;
  metricSink?: MetricSink;
}) {
  const settled = await Promise.allSettled(
    ALL_CRAWL_SOURCES.map((source) =>
      options.crawl.fetch(
        crawlInput(options.request, source),
        options.signal,
      ),
    ),
  );
  const prefetched = new Map<
    CrawlSource,
    PromiseSettledResult<CrawlPortResult>
  >();
  ALL_CRAWL_SOURCES.forEach((source, index) => {
    const result = settled[index];
    if (result !== undefined) {
      prefetched.set(source, result);
    }
  });

  const dependencies: WarehouseBuilderDependencies = {
    adapters: IDENTITY_ADAPTERS,
    transport: {
      async execute(source): Promise<CanonicalRecordBatch> {
        const result = prefetched.get(source);
        if (result === undefined) {
          throw new Error(`Missing prefetched crawl result for ${source}`);
        }
        if (result.status === "rejected") {
          throw result.reason;
        }
        if (!result.value.ok) {
          throw new Error(result.value.message);
        }
        return { records: result.value.records };
      },
    },
    reducer: { reduce: reduceOpportunityComponents },
    recommendation: options.recommendation,
    clock: options.clock,
    logger: {
      sourceFailure(source, error): void {
        writeStructuredLog({
          step: "trend_card_synthesis_source",
          runId: options.runId,
          source,
          outcome: "failure",
          reason: errorMessage(error),
        });
      },
    },
    metricSink: options.metricSink,
  };

  return await buildTrendCard(
    {
      market: options.request.market,
      seed: options.request.seed,
      productType: options.request.productType,
      window: options.request.window,
      limit: options.request.limit,
      freshnessTier: "hot",
    },
    dependencies,
  );
}

export function createSynthesizingTrendCardLiveSessionPort(
  options: CreateSynthesizingTrendCardLiveSessionPortOptions,
): LiveSessionPort {
  return {
    async create(runId: string): Promise<LiveRun> {
      const innerRun = await options.inner.create(runId);
      let lastRequest: BffRequest | undefined;
      let sawFinalCard = false;
      let synthesisAttempted = false;

      return {
        history: () => innerRun.history(),
        async *openEvents(signal?: AbortSignal): AsyncIterable<RawMaEvent> {
          for await (const event of innerRun.openEvents(signal)) {
            if (event.type === "final_card") {
              sawFinalCard = true;
            }
            yield event;
          }

          if (
            lastRequest?.kind !== "trend-card" ||
            sawFinalCard ||
            synthesisAttempted ||
            signal?.aborted
          ) {
            return;
          }

          synthesisAttempted = true;
          try {
            const card = await synthesizeTrendCard({
              runId,
              request: lastRequest.crawl,
              crawl: options.crawl,
              signal,
              clock: options.clock ?? SYSTEM_CLOCK,
              recommendation:
                options.recommendation ?? DETERMINISTIC_RECOMMENDATION,
              metricSink: options.metricSink,
            });
            if (signal?.aborted) {
              return;
            }
            yield {
              id: `${runId}:repo-synthesized-final-card`,
              type: "final_card",
              card,
            };
          } catch {
            // Synthesis is best-effort and must not interrupt MA events.
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
