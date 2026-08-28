export type CreditAction = "generate_design" | "deep_analysis";

/**
 * The BFF constructs this request after injecting sellerId from the
 * authenticated session. Client JSON must never be trusted to supply sellerId.
 */
export interface CreditDebitRequest {
  sellerId: string;
  runId: string;
  action: CreditAction;
  idempotencyKey: string;
}

export interface CreditBalance {
  sellerId: string;
  availableCredits: number;
  version: number;
  updatedAt: string;
}

export interface CreditDebitDecision {
  id: string;
  sellerId: string;
  runId: string;
  action: CreditAction;
  idempotencyKey: string;
  cost: number;
  status: "applied" | "rejected";
  balanceBefore: number;
  balanceAfter: number;
  decidedAt: string;
}

export interface InsufficientCreditError {
  code: "insufficient_credit";
  sellerId: string;
  runId: string;
  action: CreditAction;
  idempotencyKey: string;
  requiredCredits: number;
  availableCredits: number;
}

export interface CreditIdempotencyConflictError {
  code: "idempotency_conflict";
  sellerId: string;
  idempotencyKey: string;
  existingRunId: string;
  requestedRunId: string;
  existingAction: CreditAction;
  requestedAction: CreditAction;
}

export type CreditDebitResult =
  | {
      ok: true;
      decision: CreditDebitDecision & { status: "applied" };
    }
  | {
      ok: false;
      decision: CreditDebitDecision & { status: "rejected" };
      error: InsufficientCreditError;
    }
  | {
      ok: false;
      error: CreditIdempotencyConflictError;
    };

export interface SeedCreditGrantLedgerEntry {
  id: string;
  sellerId: string;
  kind: "grant";
  grantReason: "seed";
  credits: number;
  idempotencyKey: string;
  balanceAfter: number;
  createdAt: string;
}

export interface CreditDebitLedgerEntry {
  id: string;
  sellerId: string;
  kind: "debit";
  action: CreditAction;
  credits: number;
  idempotencyKey: string;
  debitDecisionId: string;
  balanceAfter: number;
  createdAt: string;
}

export interface CreditRefundLedgerEntry {
  id: string;
  sellerId: string;
  kind: "grant";
  grantReason: "refund";
  credits: number;
  idempotencyKey: string;
  originalDebitDecisionId: string;
  balanceAfter: number;
  createdAt: string;
}

export type CreditLedgerEntry =
  | SeedCreditGrantLedgerEntry
  | CreditDebitLedgerEntry
  | CreditRefundLedgerEntry;

export interface PublishDesignPayload {
  /**
   * MVP passes the Seedream URL directly. Replace this with a durable BytePlus
   * TOS object key before enabling real Printerval publishing.
   */
  assetUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  market: string;
  productType: string;
}

/**
 * The BFF constructs this request after injecting sellerId from the
 * authenticated session. Client JSON must never be trusted to supply sellerId.
 */
export interface PublishDesignRequest {
  sellerId: string;
  projectId: string;
  idempotencyKey: string;
  design: PublishDesignPayload;
}

export type PublicationStatus = "pending" | "published" | "failed";

export interface Publication {
  id: string;
  sellerId: string;
  projectId: string;
  provider: "printerval";
  idempotencyKey: string;
  status: PublicationStatus;
  providerPublicationId?: string;
  publishedUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicationError {
  code: "printerval_rejected" | "printerval_unavailable";
  recoverable: boolean;
  message: string;
}

export interface PublicationIdempotencyConflictError {
  code: "publication_idempotency_conflict";
  sellerId: string;
  idempotencyKey: string;
  existingProjectId: string;
  requestedProjectId: string;
}

export type PublishDesignResult =
  | {
      ok: true;
      publication: Publication & { status: "pending" | "published" };
    }
  | {
      ok: false;
      publication: Publication & { status: "failed" };
      error: PublicationError;
    }
  | {
      ok: false;
      error: PublicationIdempotencyConflictError;
    };

export interface ProvisionalPrintervalPublishRequest {
  projectId: string;
  idempotencyKey: string;
  design: PublishDesignPayload;
}

export type ProvisionalPrintervalPublishResponse =
  | {
      ok: true;
      publicationId: string;
      status: "published";
      publishedUrl?: string;
    }
  | {
      ok: false;
      error: PublicationError;
    };

export interface ProvisionalPrintervalPublishingFixture {
  fixtureStatus: "provisional";
  request: ProvisionalPrintervalPublishRequest;
  response: ProvisionalPrintervalPublishResponse;
}
