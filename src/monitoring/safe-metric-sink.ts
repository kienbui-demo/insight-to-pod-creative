import type { MetricObservation, MetricSink } from "../../packages/contracts";

export class SafeMetricSink implements MetricSink {
  constructor(private readonly inner: MetricSink) {}

  record(observation: MetricObservation): void {
    try {
      this.inner.record(observation);
    } catch {
      // Monitoring is observational and must never break application behavior.
    }
  }
}
