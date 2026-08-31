import { describe, expect, it, vi } from "vitest";

import type {
  CounterMetricObservation,
  MetricSink,
} from "../../../packages/contracts";
import { SafeMetricSink } from "../safe-metric-sink";

const OBSERVATION = {
  name: "ptv_crawl_source_run_total",
  kind: "counter",
  value: 1,
  labels: {
    source: "meta_ads",
    mode: "batch",
    outcome: "failure",
    stage: "execute",
  },
  observedAt: "2026-08-28T10:00:00.000Z",
} satisfies CounterMetricObservation;

describe("SafeMetricSink G5 isolation", () => {
  it("forwards observations unchanged to the inner sink", () => {
    const record = vi.fn<MetricSink["record"]>();
    const sink = new SafeMetricSink({ record });

    sink.record(OBSERVATION);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(OBSERVATION);
  });

  it("swallows an inner sink failure and never propagates it", () => {
    const monitoringFailure = new Error("monitoring backend unavailable");
    const inner: MetricSink = {
      record() {
        throw monitoringFailure;
      },
    };
    const sink = new SafeMetricSink(inner);

    expect(() => sink.record(OBSERVATION)).not.toThrow();
  });
});
