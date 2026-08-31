import type {
  MetricSink,
  ProvisionalPrintervalPublishRequest,
  ProvisionalPrintervalPublishResponse,
  Publication,
  PublishDesignRequest,
  PublishDesignResult,
} from "../../packages/contracts";
import { NOOP_METRIC_SINK } from "../monitoring/no-op-metric-sink";
import { SafeMetricSink } from "../monitoring/safe-metric-sink";

type PublicationConflictResult = Extract<
  PublishDesignResult,
  { error: { code: "publication_idempotency_conflict" } }
>;

export type PublicationReservation =
  | { kind: "winner"; publication: Publication }
  | { kind: "existing"; result: PublishDesignResult }
  | { kind: "conflict"; error: PublicationConflictResult };

export interface PublicationRepository {
  reserve(request: PublishDesignRequest): Promise<PublicationReservation>;
  saveProviderResult(
    publication: Publication,
    response: ProvisionalPrintervalPublishResponse,
  ): Promise<PublishDesignResult>;
}

export interface PrintervalPublisher {
  publish(
    request: ProvisionalPrintervalPublishRequest,
  ): Promise<ProvisionalPrintervalPublishResponse>;
}

interface CreatePublishServiceOptions {
  repository: PublicationRepository;
  publisher: PrintervalPublisher;
  // Publishing is unmetered; these guard ports must never be invoked.
  credits: { debit(...args: never[]): Promise<unknown> };
  managedAgent: { open(...args: never[]): Promise<unknown> };
  metricSink?: MetricSink;
}

export function createPublishService(options: CreatePublishServiceOptions) {
  const metricSink = new SafeMetricSink(
    options.metricSink ?? NOOP_METRIC_SINK,
  );

  const recordPublish = (outcome: "success" | "error"): void => {
    metricSink.record({
      name: "ptv_infra_operation_total",
      kind: "counter",
      value: 1,
      labels: { component: "printerval", operation: "publish", outcome },
      observedAt: new Date().toISOString(),
    });
  };

  async function publish(
    request: PublishDesignRequest,
  ): Promise<PublishDesignResult> {
    const reservation = await options.repository.reserve(request);
    if (reservation.kind === "existing") {
      return reservation.result;
    }
    if (reservation.kind === "conflict") {
      return reservation.error;
    }

    let response: ProvisionalPrintervalPublishResponse;
    try {
      response = await options.publisher.publish({
        projectId: request.projectId,
        idempotencyKey: request.idempotencyKey,
        design: request.design,
      });
      recordPublish("success");
    } catch (error) {
      recordPublish("error");
      throw error;
    }
    return options.repository.saveProviderResult(
      reservation.publication,
      response,
    );
  }

  return { publish };
}
