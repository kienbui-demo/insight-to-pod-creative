import { describe, expect, it } from "vitest";

import type { MetricSink } from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import {
  PostgresTrendCardRepository,
  type EmbeddingProvider,
  type QueryExecutor,
} from "../postgres-trend-card-repository";

class EmptyExecutor implements QueryExecutor {
  async query<Row>(): Promise<{ rows: Row[] }> {
    return { rows: [] };
  }
}

class FakeEmbeddings implements EmbeddingProvider {
  async embed(): Promise<readonly number[]> {
    return [0.1, 0.2];
  }
}

const KEY = {
  market: "US",
  seed: "retro cats",
  productType: "t-shirt",
};

describe("Postgres repository C8 monitoring", () => {
  it("records exact query, embedding, and semantic query port operations", async () => {
    const metricSink = new InMemoryMetricSink();
    const repository = new PostgresTrendCardRepository(
      new EmptyExecutor(),
      new FakeEmbeddings(),
      metricSink,
    );

    await expect(repository.findExact(KEY)).resolves.toBeNull();
    await expect(repository.findSimilar(KEY)).resolves.toBeNull();

    for (const operation of [
      "trend_card_exact_query",
      "seed_embedding",
      "trend_card_semantic_query",
    ] as const) {
      expect(metricSink.snapshot().counters).toContainEqual({
        name: "ptv_infra_operation_total",
        labels: { component: "postgres", operation, outcome: "success" },
        value: 1,
      });
    }
  });

  it("records query errors while preserving the thrown failure", async () => {
    const metricSink = new InMemoryMetricSink();
    const failure = new Error("database unavailable");
    const executor: QueryExecutor = {
      async query() {
        throw failure;
      },
    };
    const repository = new PostgresTrendCardRepository(
      executor,
      new FakeEmbeddings(),
      metricSink,
    );

    await expect(repository.findExact(KEY)).rejects.toBe(failure);
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_infra_operation_total",
      labels: {
        component: "postgres",
        operation: "trend_card_exact_query",
        outcome: "error",
      },
      value: 1,
    });
  });

  it("preserves repository results when monitoring always throws", async () => {
    const throwingSink: MetricSink = {
      record() {
        throw new Error("monitoring unavailable");
      },
    };
    const repository = new PostgresTrendCardRepository(
      new EmptyExecutor(),
      new FakeEmbeddings(),
      throwingSink,
    );

    await expect(repository.findExact(KEY)).resolves.toBeNull();
  });
});
