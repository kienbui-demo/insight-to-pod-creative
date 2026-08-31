import type { MetricSink } from "../../packages/contracts";

export const NOOP_METRIC_SINK: MetricSink = {
  record() {},
};
