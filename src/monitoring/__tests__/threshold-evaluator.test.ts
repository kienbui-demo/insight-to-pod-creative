import { describe, expect, it } from "vitest";

import type {
  CounterMetricObservation,
  CrawlMode,
  CrawlSource,
  CrawlSourceOutcome,
  InfrastructureOperationOutcome,
  MeteredOperationOutcome,
  MonitoringThresholdEvaluation,
  TrendCardBuildOutcome,
} from "../../../packages/contracts";
import { evaluateMonitoringThresholds } from "../threshold-evaluator";
import { InMemoryMetricSink } from "../in-memory-metric-sink";

const WINDOW = {
  from: "2026-08-28T10:00:00.000Z",
  to: "2026-08-28T10:05:00.000Z",
} as const;
const INSIDE = "2026-08-28T10:02:00.000Z";

const POLICY = {
  evaluationWindow: WINDOW,
  minimumSamples: {
    infrastructure: 20,
    crawl: 10,
    cost: 10,
  },
  infrastructureFailureRate: {
    warningAtOrAbove: 0.05,
    criticalAtOrAbove: 0.2,
  },
  crawlSuccessRate: {
    warningBelow: 0.9,
    criticalBelow: 0.75,
  },
  degradedCardRate: {
    warningAbove: 0.1,
    criticalAbove: 0.25,
  },
  refundRate: {
    warningAbove: 0.1,
    criticalAbove: 0.25,
  },
} as const;

function infraObservation(
  outcome: InfrastructureOperationOutcome,
  value: number,
  observedAt = INSIDE,
): CounterMetricObservation {
  return {
    name: "ptv_infra_operation_total",
    kind: "counter",
    value,
    labels: {
      component: "modelark",
      operation: "send",
      outcome,
    },
    observedAt,
  };
}

function crawlObservation(
  source: CrawlSource,
  mode: CrawlMode,
  outcome: Extract<CrawlSourceOutcome, "success" | "failure">,
  value: number,
  observedAt = INSIDE,
): CounterMetricObservation {
  return {
    name: "ptv_crawl_source_run_total",
    kind: "counter",
    value,
    labels: {
      source,
      mode,
      outcome,
      stage: "final_card",
    },
    observedAt,
  };
}

function buildObservation(
  outcome: TrendCardBuildOutcome,
  value: number,
  observedAt = INSIDE,
): CounterMetricObservation {
  return {
    name: "ptv_trend_card_build_total",
    kind: "counter",
    value,
    labels: { mode: "batch", outcome },
    observedAt,
  };
}

function meteredObservation(
  outcome: MeteredOperationOutcome,
  value: number,
  observedAt = INSIDE,
): CounterMetricObservation {
  return {
    name: "ptv_metered_operation_total",
    kind: "counter",
    value,
    labels: { action: "generate_design", outcome },
    observedAt,
  };
}

function evaluate(
  observations: readonly CounterMetricObservation[],
): readonly MonitoringThresholdEvaluation[] {
  const sink = new InMemoryMetricSink();
  for (const observation of observations) {
    sink.record(observation);
  }
  return evaluateMonitoringThresholds(sink.snapshot(), POLICY);
}

function byRule(
  evaluations: readonly MonitoringThresholdEvaluation[],
  ruleId: string,
): MonitoringThresholdEvaluation {
  const evaluation = evaluations.find((candidate) => candidate.ruleId === ruleId);
  expect(evaluation, `missing evaluation ${ruleId}`).toBeDefined();
  return evaluation!;
}

describe("evaluateMonitoringThresholds", () => {
  it("gates infrastructure failure rate on sample count and applies exact boundaries", () => {
    const insufficient = byRule(
      evaluate([infraObservation("success", 18), infraObservation("error", 1)]),
      "infrastructure.failure_rate:modelark:send",
    );
    const warning = byRule(
      evaluate([infraObservation("success", 95), infraObservation("error", 5)]),
      "infrastructure.failure_rate:modelark:send",
    );
    const critical = byRule(
      evaluate([infraObservation("success", 80), infraObservation("error", 20)]),
      "infrastructure.failure_rate:modelark:send",
    );

    expect(insufficient.status).toBe("insufficient_data");
    expect(warning).toEqual({
      ruleId: "infrastructure.failure_rate:modelark:send",
      group: "infrastructure",
      status: "warning",
      observedValue: 0.05,
      configuredBoundary: {
        operator: "greater_than_or_equal",
        value: 0.05,
      },
      evaluationWindow: WINDOW,
    });
    expect(critical).toMatchObject({
      status: "critical",
      observedValue: 0.2,
      configuredBoundary: {
        operator: "greater_than_or_equal",
        value: 0.2,
      },
    });
  });

  it("evaluates crawl success independently per source and mode", () => {
    const healthy = byRule(
      evaluate([
        crawlObservation("reddit", "batch", "success", 9),
        crawlObservation("reddit", "batch", "failure", 1),
      ]),
      "crawl.success_rate:reddit:batch",
    );
    const warning = byRule(
      evaluate([
        crawlObservation("reddit", "batch", "success", 8),
        crawlObservation("reddit", "batch", "failure", 2),
      ]),
      "crawl.success_rate:reddit:batch",
    );
    const critical = byRule(
      evaluate([
        crawlObservation("reddit", "live", "success", 7),
        crawlObservation("reddit", "live", "failure", 3),
      ]),
      "crawl.success_rate:reddit:live",
    );
    const insufficient = byRule(
      evaluate([
        crawlObservation("reddit", "batch", "success", 8),
        crawlObservation("reddit", "batch", "failure", 1),
      ]),
      "crawl.success_rate:reddit:batch",
    );

    expect(healthy).toMatchObject({ status: "healthy", observedValue: 0.9 });
    expect(warning).toMatchObject({
      status: "warning",
      observedValue: 0.8,
      configuredBoundary: { operator: "less_than", value: 0.9 },
    });
    expect(critical).toMatchObject({
      status: "critical",
      observedValue: 0.7,
      configuredBoundary: { operator: "less_than", value: 0.75 },
    });
    expect(insufficient.status).toBe("insufficient_data");
  });

  it("uses strict degraded-card boundaries and makes any zero-evidence card critical", () => {
    const healthy = byRule(
      evaluate([buildObservation("complete", 9), buildObservation("degraded", 1)]),
      "crawl.degraded_card_rate:batch",
    );
    const warning = byRule(
      evaluate([buildObservation("complete", 8), buildObservation("degraded", 2)]),
      "crawl.degraded_card_rate:batch",
    );
    const critical = byRule(
      evaluate([buildObservation("complete", 7), buildObservation("degraded", 3)]),
      "crawl.degraded_card_rate:batch",
    );
    const zeroEvidence = byRule(
      evaluate([buildObservation("zero_evidence", 1)]),
      "crawl.zero_evidence:batch",
    );

    expect(healthy).toMatchObject({ status: "healthy", observedValue: 0.1 });
    expect(warning).toMatchObject({
      status: "warning",
      observedValue: 0.2,
      configuredBoundary: { operator: "greater_than", value: 0.1 },
    });
    expect(critical).toMatchObject({
      status: "critical",
      observedValue: 0.3,
      configuredBoundary: { operator: "greater_than", value: 0.25 },
    });
    expect(zeroEvidence).toEqual({
      ruleId: "crawl.zero_evidence:batch",
      group: "crawl",
      status: "critical",
      observedValue: 1,
      configuredBoundary: { operator: "greater_than", value: 0 },
      evaluationWindow: WINDOW,
    });
  });

  it("evaluates refund rate only after the cost minimum sample count", () => {
    const insufficient = byRule(
      evaluate([
        meteredObservation("succeeded", 7),
        meteredObservation("failed_refunded", 2),
      ]),
      "cost.refund_rate:generate_design",
    );
    const healthy = byRule(
      evaluate([
        meteredObservation("succeeded", 9),
        meteredObservation("failed_refunded", 1),
      ]),
      "cost.refund_rate:generate_design",
    );
    const warning = byRule(
      evaluate([
        meteredObservation("succeeded", 8),
        meteredObservation("failed_refunded", 2),
      ]),
      "cost.refund_rate:generate_design",
    );
    const critical = byRule(
      evaluate([
        meteredObservation("succeeded", 7),
        meteredObservation("failed_refunded", 3),
      ]),
      "cost.refund_rate:generate_design",
    );

    expect(insufficient.status).toBe("insufficient_data");
    expect(healthy).toMatchObject({ status: "healthy", observedValue: 0.1 });
    expect(warning).toMatchObject({
      status: "warning",
      observedValue: 0.2,
      configuredBoundary: { operator: "greater_than", value: 0.1 },
    });
    expect(critical).toMatchObject({
      status: "critical",
      observedValue: 0.3,
      configuredBoundary: { operator: "greater_than", value: 0.25 },
    });
  });

  it("ignores observations outside the inclusive evaluation window", () => {
    const result = byRule(
      evaluate([
        infraObservation("success", 95, WINDOW.from),
        infraObservation("error", 5, WINDOW.to),
        infraObservation("error", 100, "2026-08-28T09:59:59.999Z"),
        infraObservation("error", 100, "2026-08-28T10:05:00.001Z"),
      ]),
      "infrastructure.failure_rate:modelark:send",
    );

    expect(result).toMatchObject({ status: "warning", observedValue: 0.05 });
  });

  it("escalates Meta one severity and keeps isolated TikTok degradation at warning", () => {
    const metaIsolated = byRule(
      evaluate([
        crawlObservation("meta_ads", "batch", "success", 9),
        crawlObservation("meta_ads", "batch", "failure", 1),
      ]),
      "crawl.success_rate:meta_ads:batch",
    );
    const metaWarning = byRule(
      evaluate([
        crawlObservation("meta_ads", "batch", "success", 17),
        crawlObservation("meta_ads", "batch", "failure", 3),
      ]),
      "crawl.success_rate:meta_ads:batch",
    );
    const tiktokIsolated = byRule(
      evaluate([
        crawlObservation("tiktok", "live", "success", 9),
        crawlObservation("tiktok", "live", "failure", 1),
      ]),
      "crawl.success_rate:tiktok:live",
    );
    const tiktokCritical = byRule(
      evaluate([
        crawlObservation("tiktok", "live", "success", 7),
        crawlObservation("tiktok", "live", "failure", 3),
      ]),
      "crawl.success_rate:tiktok:live",
    );

    expect(metaIsolated).toMatchObject({ status: "warning", observedValue: 0.9 });
    expect(metaWarning).toMatchObject({ status: "critical", observedValue: 0.85 });
    expect(tiktokIsolated).toMatchObject({ status: "warning", observedValue: 0.9 });
    expect(tiktokCritical).toMatchObject({ status: "critical", observedValue: 0.7 });
  });
});
