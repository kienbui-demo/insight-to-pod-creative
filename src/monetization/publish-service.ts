import type {
  ProvisionalPrintervalPublishRequest,
  ProvisionalPrintervalPublishResponse,
  Publication,
  PublishDesignRequest,
  PublishDesignResult,
} from "../../packages/contracts";

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
}

export function createPublishService(options: CreatePublishServiceOptions) {
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

    const response = await options.publisher.publish({
      projectId: request.projectId,
      idempotencyKey: request.idempotencyKey,
      design: request.design,
    });
    return options.repository.saveProviderResult(
      reservation.publication,
      response,
    );
  }

  return { publish };
}
