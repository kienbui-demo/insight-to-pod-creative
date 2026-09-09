import type { MetricObservation, MetricSink } from "../../packages/contracts";
import { SafeMetricSink } from "./safe-metric-sink";

export type StructuredLogClock = () => string;

export interface StructuredLogEntry {
  step?: string;
  [key: string]: unknown;
}

const REAL_CLOCK: StructuredLogClock = () => new Date().toISOString();

export function writeStructuredLog(
  entry: StructuredLogEntry,
  clock: StructuredLogClock = REAL_CLOCK,
): void {
  try {
    console.log(JSON.stringify({ ...entry, ts: clock() }));
  } catch {
    // Logging is observational and must never break application behavior.
  }
}

export class ConsoleLogMetricSink implements MetricSink {
  private readonly inner: MetricSink;
  private readonly clock: StructuredLogClock;
  private readonly observationIds = new Set<string>();

  constructor(
    inner: MetricSink,
    clock: StructuredLogClock = REAL_CLOCK,
  ) {
    this.inner = new SafeMetricSink(inner);
    this.clock = clock;
  }

  record(observation: MetricObservation): void {
    if (observation.observationId !== undefined) {
      if (this.observationIds.has(observation.observationId)) {
        return;
      }
      this.observationIds.add(observation.observationId);
    }

    this.inner.record(observation);

    const outcome =
      "outcome" in observation.labels
        ? { outcome: observation.labels.outcome }
        : {};
    const duration = observation.name.endsWith("_duration_ms")
      ? { durationMs: observation.value }
      : {};

    writeStructuredLog(
      {
        metric: observation.name,
        kind: observation.kind,
        value: observation.value,
        labels: observation.labels,
        ...(observation.observationId === undefined
          ? {}
          : { observationId: observation.observationId }),
        ...outcome,
        ...duration,
      },
      this.clock,
    );
  }
}
