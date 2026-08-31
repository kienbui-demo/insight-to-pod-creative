import { describe, expect, it } from "vitest";

import type {
  CounterMetricObservation,
  DistributionMetricObservation,
  MetricObservation,
} from "../../../packages/contracts";
import { InMemoryMetricSink } from "../in-memory-metric-sink";

const COUNTER_SUCCESS = {
  name: "ptv_infra_operation_total",
  kind: "counter",
  value: 1,
  labels: {
    component: "modelark",
    operation: "send",
    outcome: "success",
  },
  observedAt: "2026-08-28T10:00:00.000Z",
} satisfies CounterMetricObservation;

const COUNTER_ERROR = {
  name: "ptv_infra_operation_total",
  kind: "counter",
  value: 1,
  labels: {
    component: "modelark",
    operation: "send",
    outcome: "error",
  },
  observedAt: "2026-08-28T10:00:01.000Z",
} satisfies CounterMetricObservation;

const DISTRIBUTION_LATE = {
  name: "ptv_infra_operation_duration_ms",
  kind: "distribution",
  value: 12,
  labels: {
    component: "modelark",
    operation: "send",
    outcome: "success",
  },
  observedAt: "2026-08-28T10:00:03.000Z",
} satisfies DistributionMetricObservation;

const DISTRIBUTION_EARLY = {
  ...DISTRIBUTION_LATE,
  value: 7,
  observedAt: "2026-08-28T10:00:02.000Z",
} satisfies DistributionMetricObservation;

function recordAll(
  sink: InMemoryMetricSink,
  observations: readonly MetricObservation[],
): void {
  for (const observation of observations) {
    sink.record(observation);
  }
}

describe("InMemoryMetricSink", () => {
  it("aggregates counters by the exact label set and collects distribution samples", () => {
    const sink = new InMemoryMetricSink();

    recordAll(sink, [
      DISTRIBUTION_LATE,
      { ...COUNTER_SUCCESS, value: 2 },
      COUNTER_ERROR,
      DISTRIBUTION_EARLY,
      COUNTER_SUCCESS,
    ]);

    const snapshot = sink.snapshot();

    expect(snapshot.counters).toEqual([
      {
        name: "ptv_infra_operation_total",
        labels: {
          component: "modelark",
          operation: "send",
          outcome: "error",
        },
        value: 1,
      },
      {
        name: "ptv_infra_operation_total",
        labels: {
          component: "modelark",
          operation: "send",
          outcome: "success",
        },
        value: 3,
      },
    ]);
    expect(snapshot.distributions).toEqual([
      {
        name: "ptv_infra_operation_duration_ms",
        labels: {
          component: "modelark",
          operation: "send",
          outcome: "success",
        },
        samples: [7, 12],
      },
    ]);
  });

  it("returns the same deterministic snapshot regardless of recording order", () => {
    const observations = [
      COUNTER_SUCCESS,
      COUNTER_ERROR,
      DISTRIBUTION_EARLY,
      DISTRIBUTION_LATE,
    ] satisfies readonly MetricObservation[];
    const forward = new InMemoryMetricSink();
    const reverse = new InMemoryMetricSink();

    recordAll(forward, observations);
    recordAll(reverse, [...observations].reverse());

    expect(reverse.snapshot()).toEqual(forward.snapshot());
  });

  it("ignores every later observation with a duplicate observationId globally", () => {
    const sink = new InMemoryMetricSink();

    sink.record({
      name: "ptv_credits_debited_total",
      kind: "counter",
      value: 5,
      labels: { action: "generate_design" },
      observedAt: "2026-08-28T10:00:00.000Z",
      observationId: "credit-decision-1",
    });
    sink.record({
      name: "ptv_credits_debited_total",
      kind: "counter",
      value: 99,
      labels: { action: "generate_design" },
      observedAt: "2026-08-28T10:00:01.000Z",
      observationId: "credit-decision-1",
    });
    sink.record({
      ...DISTRIBUTION_EARLY,
      value: 999,
      observationId: "credit-decision-1",
    });

    expect(sink.snapshot().counters).toEqual([
      {
        name: "ptv_credits_debited_total",
        labels: { action: "generate_design" },
        value: 5,
      },
    ]);
    expect(sink.snapshot().distributions).toEqual([]);
    expect(sink.snapshot().observations).toHaveLength(1);
  });

  it("counts every observation that has no observationId", () => {
    const sink = new InMemoryMetricSink();

    sink.record({ ...COUNTER_SUCCESS, value: 2 });
    sink.record({ ...COUNTER_SUCCESS, value: 2 });

    expect(sink.snapshot().counters).toEqual([
      {
        name: "ptv_infra_operation_total",
        labels: COUNTER_SUCCESS.labels,
        value: 4,
      },
    ]);
    expect(sink.snapshot().observations).toHaveLength(2);
  });
});
