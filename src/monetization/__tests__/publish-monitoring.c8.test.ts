import { describe, expect, it } from "vitest";

import type {
  MetricSink,
  Publication,
  PublishDesignRequest,
} from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import {
  createPublishService,
  type PublicationRepository,
  type PrintervalPublisher,
} from "../publish-service";

const REQUEST: PublishDesignRequest = {
  sellerId: "seller-monitoring",
  projectId: "project-monitoring",
  idempotencyKey: "publish-monitoring",
  design: {
    assetUrl: "https://tos.example/design.png",
    title: "Monitoring Design",
    market: "US",
    productType: "t-shirt",
  },
};

const PUBLICATION: Publication = {
  id: "publication-monitoring",
  sellerId: REQUEST.sellerId,
  projectId: REQUEST.projectId,
  provider: "printerval",
  idempotencyKey: REQUEST.idempotencyKey,
  status: "pending",
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
};

const repository: PublicationRepository = {
  async reserve() {
    return { kind: "winner", publication: PUBLICATION };
  },
  async saveProviderResult(publication, response) {
    if (!response.ok) {
      return {
        ok: false,
        publication: { ...publication, status: "failed" },
        error: response.error,
      };
    }
    return {
      ok: true,
      publication: {
        ...publication,
        status: "published",
        providerPublicationId: response.publicationId,
      },
    };
  },
};

function publishService(metricSink: MetricSink, publisher: PrintervalPublisher) {
  return createPublishService({
    repository,
    publisher,
    credits: { debit: async () => undefined },
    managedAgent: { open: async () => undefined },
    metricSink,
  });
}

describe("publish-service C8 monitoring", () => {
  it("records successful Printerval port execution", async () => {
    const metricSink = new InMemoryMetricSink();
    const result = await publishService(metricSink, {
      async publish() {
        return {
          ok: true,
          publicationId: "provider-publication",
          status: "published",
        };
      },
    }).publish(REQUEST);

    expect(result).toMatchObject({ ok: true, publication: { status: "published" } });
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_infra_operation_total",
      labels: {
        component: "printerval",
        operation: "publish",
        outcome: "success",
      },
      value: 1,
    });
  });

  it("records a thrown publisher error and preserves rejection", async () => {
    const metricSink = new InMemoryMetricSink();
    const failure = new Error("provider connection failed");

    await expect(
      publishService(metricSink, {
        async publish() {
          throw failure;
        },
      }).publish(REQUEST),
    ).rejects.toBe(failure);
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_infra_operation_total",
      labels: {
        component: "printerval",
        operation: "publish",
        outcome: "error",
      },
      value: 1,
    });
  });

  it("keeps publication behavior unchanged when every metric record throws", async () => {
    const throwingSink: MetricSink = {
      record() {
        throw new Error("monitoring unavailable");
      },
    };

    const result = await publishService(throwingSink, {
      async publish() {
        return {
          ok: true,
          publicationId: "provider-publication",
          status: "published",
        };
      },
    }).publish(REQUEST);

    expect(result).toMatchObject({ ok: true, publication: { status: "published" } });
  });
});
