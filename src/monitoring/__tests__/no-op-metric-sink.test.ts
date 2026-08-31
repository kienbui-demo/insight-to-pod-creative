import { describe, expect, it } from "vitest";

import type { MetricObservation } from "../../../packages/contracts";
import { NOOP_METRIC_SINK } from "../no-op-metric-sink";

const OBSERVATIONS = [
  {
    name: "ptv_live_request_total",
    kind: "counter",
    value: 1,
    labels: {
      requestKind: "deep_dive",
      deliveryPath: "managed_agent",
      outcome: "success",
    },
    observedAt: "2026-08-28T10:00:00.000Z",
  },
  {
    name: "ptv_live_request_dispatch_duration_ms",
    kind: "distribution",
    value: 14,
    labels: {
      requestKind: "deep_dive",
      deliveryPath: "managed_agent",
      outcome: "success",
    },
    observedAt: "2026-08-28T10:00:00.014Z",
  },
] satisfies readonly MetricObservation[];

describe("NOOP_METRIC_SINK", () => {
  it("accepts every metric observation and does nothing", () => {
    expect(() => {
      for (const observation of OBSERVATIONS) {
        NOOP_METRIC_SINK.record(observation);
      }
    }).not.toThrow();
  });
});
