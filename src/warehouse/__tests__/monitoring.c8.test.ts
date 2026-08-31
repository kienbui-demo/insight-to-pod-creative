import { describe, expect, it } from "vitest";

import type { CrawlSource, MetricSink } from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import {
  ALL_CRAWL_SOURCES,
  RECORDS_BY_SOURCE,
} from "../__fixtures__/canonical-records";
import { reduceOpportunityComponents } from "../component-reducer";
import { buildTrendCard } from "../trend-card-builder";
import type { WarehouseBuildInput } from "../types";
import { FakeCrawlTransport } from "./support/fake-crawl-transport";
import { createFakeAdapters } from "./support/fake-source-adapters";
import { FixedClock } from "./support/fixed-clock";
import { MockMaRecommendation } from "./support/mock-ma-recommendation";

const INPUT: WarehouseBuildInput = {
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  freshnessTier: "warm",
};

function completeOutputs(): Partial<Record<CrawlSource, unknown>> {
  return Object.fromEntries(
    ALL_CRAWL_SOURCES.map((source) => [source, RECORDS_BY_SOURCE[source]]),
  );
}

function dependencies(options: {
  metricSink?: MetricSink;
  outputs?: Partial<Record<CrawlSource, unknown>>;
  errors?: Partial<Record<CrawlSource, Error>>;
  adapters?: ReturnType<typeof createFakeAdapters>;
  recommendation?: MockMaRecommendation;
} = {}) {
  return {
    adapters: options.adapters ?? createFakeAdapters(ALL_CRAWL_SOURCES),
    transport: new FakeCrawlTransport({
      outputs: options.outputs ?? completeOutputs(),
      errors: options.errors,
    }),
    reducer: { reduce: reduceOpportunityComponents },
    recommendation: options.recommendation ?? new MockMaRecommendation(),
    clock: new FixedClock(),
    logger: { sourceFailure() {} },
    metricSink: options.metricSink,
  };
}

describe("warehouse C8 monitoring", () => {
  it("records contributing source records and a complete batch build", async () => {
    const metricSink = new InMemoryMetricSink();

    const card = await buildTrendCard(INPUT, dependencies({ metricSink }));

    expect(card.missingSources).toEqual([]);
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_crawl_source_run_total",
      labels: {
        source: "google_trends",
        mode: "batch",
        outcome: "success",
        stage: "final_card",
      },
      value: 1,
    });
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_crawl_records_total",
      labels: { source: "amazon", mode: "batch" },
      value: 2,
    });
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_trend_card_build_total",
      labels: { mode: "batch", outcome: "complete" },
      value: 1,
    });
  });

  it("records empty and exact adapt/execute/normalize failure stages without changing the partial card", async () => {
    const outputs = completeOutputs();
    outputs.tiktok = [];
    const adapters = createFakeAdapters(ALL_CRAWL_SOURCES, {
      google_trends: { adaptError: new Error("adapt failed") },
      pinterest: { normalizeError: new Error("normalize failed") },
    });
    const errors = { reddit: new Error("execute failed") };
    const baseline = await buildTrendCard(
      INPUT,
      dependencies({ outputs, errors, adapters }),
    );
    const metricSink = new InMemoryMetricSink();

    const observed = await buildTrendCard(
      INPUT,
      dependencies({
        metricSink,
        outputs,
        errors,
        adapters: createFakeAdapters(ALL_CRAWL_SOURCES, {
          google_trends: { adaptError: new Error("adapt failed") },
          pinterest: { normalizeError: new Error("normalize failed") },
        }),
      }),
    );

    expect(observed).toEqual(baseline);
    expect(metricSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "google_trends",
            mode: "batch",
            outcome: "failure",
            stage: "adapt",
          },
          value: 1,
        },
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "reddit",
            mode: "batch",
            outcome: "failure",
            stage: "execute",
          },
          value: 1,
        },
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "pinterest",
            mode: "batch",
            outcome: "failure",
            stage: "normalize",
          },
          value: 1,
        },
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "tiktok",
            mode: "batch",
            outcome: "empty",
            stage: "final_card",
          },
          value: 1,
        },
        {
          name: "ptv_trend_card_build_total",
          labels: { mode: "batch", outcome: "degraded" },
          value: 1,
        },
      ]),
    );
  });

  it("records zero-evidence and failed builds", async () => {
    const zeroSink = new InMemoryMetricSink();
    const emptyOutputs = Object.fromEntries(
      ALL_CRAWL_SOURCES.map((source) => [source, []]),
    );

    const zeroCard = await buildTrendCard(
      INPUT,
      dependencies({ metricSink: zeroSink, outputs: emptyOutputs }),
    );

    expect(zeroCard.availableSources).toEqual([]);
    expect(zeroSink.snapshot().counters).toContainEqual({
      name: "ptv_trend_card_build_total",
      labels: { mode: "batch", outcome: "zero_evidence" },
      value: 1,
    });

    const failureSink = new InMemoryMetricSink();
    const recommendationError = new Error("MA recommendation failed");
    await expect(
      buildTrendCard(
        INPUT,
        dependencies({
          metricSink: failureSink,
          recommendation: new MockMaRecommendation(undefined, recommendationError),
        }),
      ),
    ).rejects.toBe(recommendationError);
    expect(failureSink.snapshot().counters).toContainEqual({
      name: "ptv_trend_card_build_total",
      labels: { mode: "batch", outcome: "failure" },
      value: 1,
    });
  });

  it("keeps G5 partial-card behavior when every metric record throws", async () => {
    const failure = new Error("TikTok unavailable");
    const baseline = await buildTrendCard(
      INPUT,
      dependencies({ errors: { tiktok: failure } }),
    );
    const throwingSink: MetricSink = {
      record() {
        throw new Error("monitoring unavailable");
      },
    };

    const observed = await buildTrendCard(
      INPUT,
      dependencies({ metricSink: throwingSink, errors: { tiktok: failure } }),
    );

    expect(observed).toEqual(baseline);
    expect(observed.missingSources).toEqual(["tiktok"]);
  });
});
