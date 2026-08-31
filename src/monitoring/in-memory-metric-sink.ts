import type {
  CounterMetricName,
  DistributionMetricName,
  MetricLabelsByName,
  MetricObservation,
  MetricSink,
} from "../../packages/contracts";

export interface CounterSnapshotEntry {
  name: CounterMetricName;
  labels: MetricLabelsByName[CounterMetricName];
  value: number;
}

export interface DistributionSnapshotEntry {
  name: DistributionMetricName;
  labels: MetricLabelsByName[DistributionMetricName];
  samples: number[];
}

export interface MetricSnapshot {
  counters: CounterSnapshotEntry[];
  distributions: DistributionSnapshotEntry[];
  observations: MetricObservation[];
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function aggregationKey(observation: MetricObservation): string {
  return `${observation.name}\u0000${stableSerialize(observation.labels)}`;
}

export class InMemoryMetricSink implements MetricSink {
  private readonly retained: MetricObservation[] = [];
  private readonly observationIds = new Set<string>();

  record(observation: MetricObservation): void {
    if (observation.observationId !== undefined) {
      if (this.observationIds.has(observation.observationId)) {
        return;
      }
      this.observationIds.add(observation.observationId);
    }
    this.retained.push(observation);
  }

  snapshot(): MetricSnapshot {
    const counters = new Map<string, CounterSnapshotEntry>();
    const distributions = new Map<string, DistributionSnapshotEntry>();

    for (const observation of this.retained) {
      const key = aggregationKey(observation);
      if (observation.kind === "counter") {
        const existing = counters.get(key);
        if (existing) {
          existing.value += observation.value;
        } else {
          counters.set(key, {
            name: observation.name,
            labels: observation.labels,
            value: observation.value,
          });
        }
      } else {
        const existing = distributions.get(key);
        if (existing) {
          existing.samples.push(observation.value);
        } else {
          distributions.set(key, {
            name: observation.name,
            labels: observation.labels,
            samples: [observation.value],
          });
        }
      }
    }

    return {
      counters: [...counters.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, entry]) => ({ ...entry })),
      distributions: [...distributions.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, entry]) => ({
          ...entry,
          samples: [...entry.samples].sort((left, right) => left - right),
        })),
      observations: [...this.retained].sort((left, right) =>
        stableSerialize(left).localeCompare(stableSerialize(right)),
      ),
    };
  }
}
