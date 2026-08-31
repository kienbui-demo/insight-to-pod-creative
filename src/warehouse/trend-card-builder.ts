import { createHash } from "node:crypto";

import type {
  CanonicalRecord,
  CrawlRequest,
  CrawlSource,
  CrawlStage,
  MetricSink,
  TrendCard,
} from "../../packages/contracts";
import { NOOP_METRIC_SINK } from "../monitoring/no-op-metric-sink";
import { SafeMetricSink } from "../monitoring/safe-metric-sink";
import { scoreOpportunity } from "../scoring/opportunity-score";
import { ALL_CRAWL_SOURCES } from "./component-reducer";
import type {
  WarehouseBuildInput,
  WarehouseBuilderDependencies,
} from "./types";

function normalizeSeed(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeProductType(value: string | undefined): string {
  return value === undefined ? "" : normalizeSeed(value);
}

function trendCardId(input: WarehouseBuildInput): string {
  const key = [
    input.market.trim().toUpperCase(),
    normalizeSeed(input.seed),
    normalizeProductType(input.productType),
  ].join("|");

  return `trend_${createHash("sha256").update(key).digest("hex")}`;
}

function trendSeries(records: readonly CanonicalRecord[]): TrendCard["trendSeries"] {
  const points: TrendCard["trendSeries"] = [];

  for (const record of records) {
    if (record.source !== "google_trends") {
      continue;
    }

    const series = record.payload.trendSeries;
    if (!Array.isArray(series)) {
      continue;
    }

    for (const point of series) {
      if (
        typeof point === "object" &&
        point !== null &&
        "t" in point &&
        "v" in point &&
        typeof point.t === "string" &&
        typeof point.v === "number" &&
        Number.isFinite(point.v)
      ) {
        points.push({ t: point.t, v: point.v });
      }
    }
  }

  return points;
}

function referenceImages(
  records: readonly CanonicalRecord[],
): TrendCard["referenceImages"] {
  const images = new Set<string>();

  for (const record of records) {
    const urls = record.payload.referenceImageUrls;
    if (!Array.isArray(urls)) {
      continue;
    }

    for (const url of urls) {
      if (typeof url === "string" && url.length > 0) {
        images.add(url);
      }
    }
  }

  return [...images];
}

function competitors(
  records: readonly CanonicalRecord[],
): TrendCard["competitors"] {
  const collected: NonNullable<TrendCard["competitors"]> = [];

  for (const record of records) {
    if (record.source !== "amazon" && record.source !== "etsy") {
      continue;
    }

    const candidates = record.payload.competitors;
    if (!Array.isArray(candidates)) {
      continue;
    }

    for (const candidate of candidates) {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        !("title" in candidate) ||
        typeof candidate.title !== "string"
      ) {
        continue;
      }

      const competitor: NonNullable<TrendCard["competitors"]>[number] = {
        title: candidate.title,
      };

      if (
        "price" in candidate &&
        typeof candidate.price === "number" &&
        Number.isFinite(candidate.price)
      ) {
        competitor.price = candidate.price;
      }

      if (
        "adActive" in candidate &&
        typeof candidate.adActive === "boolean"
      ) {
        competitor.adActive = candidate.adActive;
      }

      collected.push(competitor);
    }
  }

  return collected.length > 0 ? collected : undefined;
}

async function collectSourceRecords(
  input: WarehouseBuildInput,
  source: CrawlSource,
  dependencies: WarehouseBuilderDependencies,
  metricSink: MetricSink,
): Promise<CanonicalRecord[]> {
  const request: CrawlRequest = {
    source,
    market: input.market,
    seed: input.seed,
    productType: input.productType,
    window: input.window,
    limit: input.limit,
    mode: "batch",
  };

  const adapter = dependencies.adapters[source];
  let stage: CrawlStage = "adapt";
  try {
    const providerRequest = adapter.adapt(request);
    stage = "execute";
    const providerOutput = await dependencies.transport.execute(
      source,
      providerRequest,
      request,
    );
    stage = "normalize";
    const records = adapter.normalize(providerOutput);
    metricSink.record({
      name: "ptv_crawl_source_run_total",
      kind: "counter",
      value: 1,
      labels: {
        source,
        mode: "batch",
        outcome: records.length > 0 ? "success" : "empty",
        stage: "final_card",
      },
      observedAt: dependencies.clock.nowIso(),
    });
    if (records.length > 0) {
      metricSink.record({
        name: "ptv_crawl_records_total",
        kind: "counter",
        value: records.length,
        labels: { source, mode: "batch" },
        observedAt: dependencies.clock.nowIso(),
      });
    }
    return records;
  } catch (error) {
    metricSink.record({
      name: "ptv_crawl_source_run_total",
      kind: "counter",
      value: 1,
      labels: { source, mode: "batch", outcome: "failure", stage },
      observedAt: dependencies.clock.nowIso(),
    });
    throw error;
  }
}

export async function buildTrendCard(
  input: WarehouseBuildInput,
  dependencies: WarehouseBuilderDependencies,
): Promise<TrendCard> {
  const metricSink = new SafeMetricSink(
    dependencies.metricSink ?? NOOP_METRIC_SINK,
  );
  const records: CanonicalRecord[] = [];

  for (const source of ALL_CRAWL_SOURCES) {
    try {
      records.push(
        ...(await collectSourceRecords(input, source, dependencies, metricSink)),
      );
    } catch (error) {
      dependencies.logger.sourceFailure(source, error);
    }
  }

  try {
    const reduction = dependencies.reducer.reduce(records);
    const contributing = new Set(reduction.contributingSources);
    const availableSources = ALL_CRAWL_SOURCES.filter((source) =>
      contributing.has(source),
    );
    const missingSources = ALL_CRAWL_SOURCES.filter(
      (source) => !contributing.has(source),
    );
    const scoring = scoreOpportunity({
      components: reduction.components,
      availableSources,
      missingSources,
    });
    const recommendation = await dependencies.recommendation.recommend({
      request: input,
      records,
      components: reduction.components,
      availableSources,
      missingSources,
      ...scoring,
    });
    const usableRecords = records.filter((record) =>
      contributing.has(record.source),
    );
    const card: TrendCard = {
      id: trendCardId(input),
      market: input.market,
      seed: input.seed,
      productType: input.productType,
      opportunityScore: scoring.opportunityScore,
      confidence: scoring.confidence,
      availableSources,
      missingSources,
      trendSeries: trendSeries(usableRecords),
      referenceImages: referenceImages(usableRecords),
      competitors: competitors(usableRecords),
      recommendation,
      freshnessTier: input.freshnessTier,
      updatedAt: dependencies.clock.nowIso(),
    };
    const outcome =
      availableSources.length === 0
        ? "zero_evidence"
        : missingSources.length === 0
          ? "complete"
          : "degraded";
    metricSink.record({
      name: "ptv_trend_card_build_total",
      kind: "counter",
      value: 1,
      labels: { mode: "batch", outcome },
      observedAt: dependencies.clock.nowIso(),
    });
    return card;
  } catch (error) {
    metricSink.record({
      name: "ptv_trend_card_build_total",
      kind: "counter",
      value: 1,
      labels: { mode: "batch", outcome: "failure" },
      observedAt: dependencies.clock.nowIso(),
    });
    throw error;
  }
}
