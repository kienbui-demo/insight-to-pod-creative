# Frozen Contracts — v1

> These are the synchronization primitives for parallel agents. NOTHING runs in parallel until these are frozen. Changing a contract after freeze = stop-the-world event: notify all agents, bump version, re-align. Agents communicate ONLY through these contracts, never by reading each other's code.

## C1. CrawlRequest (canonical crawl input)

```typescript
export type CrawlSource =
  | 'google_trends' | 'reddit' | 'pinterest' | 'tiktok'
  | 'amazon' | 'etsy' | 'meta_ads';

export interface CrawlRequest {
  source: CrawlSource;
  market: string;            // ISO-ish market code, e.g. "US", "DE"
  seed: string;              // topic / niche / holiday keyword
  productType?: string;      // "t-shirt" | "mug" | "poster" | ...
  window?: { from: string; to: string }; // ISO dates
  limit?: number;
  mode: 'batch' | 'live';    // batch = warehouse cron; live = Live Theater
}
```

## C2. Adapter interface (every source implements this)

```typescript
export interface CanonicalRecord {
  source: CrawlSource;
  market: string;
  seed: string;
  capturedAt: string;        // ISO timestamp
  signalType: 'demand' | 'culture' | 'ad' | 'price' | 'competition';
  payload: Record<string, unknown>; // source-specific, documented per adapter
  rawRef?: string;           // TOS object key for the raw JSON
}

export interface SourceAdapter {
  source: CrawlSource;
  adapt(req: CrawlRequest): unknown;               // canonical -> provider input
  normalize(providerOutput: unknown): CanonicalRecord[]; // provider output -> canonical
}
```

## C3. TrendCard (warehouse output / UI input)

```typescript
export interface TrendCard {
  id: string;
  market: string;
  seed: string;
  productType?: string;
  opportunityScore: number;      // 0..100, see spec-scoring.md
  confidence: number;            // 0..1, see spec-scoring.md
  availableSources: CrawlSource[]; // which sources contributed
  missingSources: CrawlSource[];   // flagged in UI
  trendSeries: { t: string; v: number }[];
  referenceImages: string[];     // TOS urls
  competitors?: { title: string; price?: number; adActive?: boolean }[];
  recommendation: { action: string; reasoning: string };
  freshnessTier: 'hot' | 'warm' | 'cold';
  updatedAt: string;
}
```

## C4. SSE event schema (BFF -> UI, translated from raw MA events)

```typescript
export type UiEvent =
  | { id: string; type: 'scanning'; source: CrawlSource }
  | { id: string; type: 'synthesizing'; note?: string }
  | { id: string; type: 'image:ready'; url: string }
  | { id: string; type: 'card:ready'; card: TrendCard }
  | { id: string; type: 'error'; recoverable: boolean; message: string }
  | { id: string; type: 'done' };
```
Rules: open stream BEFORE sending user events; on reconnect pull full history and dedup by `event.id`; UI never calls MA directly.

## C5. Postgres schema (initial migration 0001)

- `trend_cards` — columns matching C3 (jsonb for arrays/objects), + `embedding vector(N)` (pgvector).
- `seller_projects` — one row per seller project/session mapping.
- Cache lookup order: exact match (market+seed+productType) → pgvector semantic search ≥ threshold → miss.
- Migrations are append-only: filename `NNNN_description.sql` where NNNN is a UTC timestamp, NOT a sequential counter (avoids two agents claiming the same number).

## C6. Live run identity

- `runId` is a client-generated opaque UUID for one logical UI action.
- Reconnects for that action reuse the same `runId`.
- The first request creates one ModelArk Managed Agent session and persists its returned ID.
- Later requests and reconnects resolve the persisted MA session ID by `runId`.
- A `runId` is never treated as the MA session ID.
- Different logical UI actions receive different `runId` values.
- Mapping creation must be concurrency-safe: competing first requests for one `runId` resolve to one canonical persisted mapping.
- A live run is transport-level and can exist before any seller project is persisted, so its mapping is stored in `ma_run_sessions`, not `seller_projects`.

```typescript
export interface RunSessionMapping {
  runId: string;
  maSessionId: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface CreateRunSessionMapping {
  runId: string;
  maSessionId: string;
}

export interface RunSessionRepository {
  findByRunId(runId: string): Promise<RunSessionMapping | null>;
  saveIfAbsent(input: CreateRunSessionMapping): Promise<RunSessionMapping>;
}
```

`saveIfAbsent` returns the canonical stored mapping. If another caller already stored a mapping for the same `runId`, it returns that existing mapping rather than replacing it.

### C1 provisional MA-event recording shape

The C1 recorded MA fixtures use this frozen envelope and provisional event union. `fixtureStatus` must remain the literal `"provisional"`. These fixtures verify decoder and semantic-mapper logic; they do not claim that the event union is the final real ModelArk wire schema. C1 must not change the frozen BFF-local `RawMaEvent` union or the frozen Seedream custom-tool schema.

```typescript
export interface ProvisionalMaEventRecording {
  fixtureStatus: "provisional";
  events: readonly ProvisionalManagedAgentEvent[];
}

export type ProvisionalManagedAgentEvent =
  | {
      id: string;
      type: "agent.custom_tool_use";
      name: "crawl";
      input: { source: CrawlSource };
    }
  | { id: string; type: "agent.thinking"; note?: string }
  | {
      id: string;
      type: "user.custom_tool_result";
      custom_tool_use_id: string;
      name: "generate_design_image";
      input: GenerateDesignImageInput;
      result: GenerateDesignImageResult;
    }
  | {
      id: string;
      type: "agent.output";
      output: { kind: "trend_card"; card: TrendCard };
    }
  | {
      id: string;
      type: "session.error";
      error: {
        source?: CrawlSource;
        recoverable: boolean;
        message: string;
      };
    }
  | {
      id: string;
      type: "session.status_idle";
      stop_reason: { type: "end_turn" };
    }
  | { id: string; type: "span.model_request_start"; model: string };
```

## C7. Monetization

C7 is additive. Frozen C3 `TrendCard` and C4 `UiEvent` remain unchanged.

```typescript
export type CreditAction = "generate_design" | "deep_analysis";

// sellerId is injected from the authenticated BFF session. The BFF must never
// trust or forward a sellerId supplied in client JSON.
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
  // MVP accepts the Seedream URL directly. Replace it with a durable BytePlus
  // TOS object key before enabling real Printerval publishing.
  assetUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  market: string;
  productType: string;
}

// sellerId is injected from the authenticated BFF session. The BFF must never
// trust or forward a sellerId supplied in client JSON.
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
```

### Credit rules

- Costs are server-owned: `generate_design` costs 5 credits and `deep_analysis` costs 2. Publishing is unmetered. Clients never submit a cost.
- A seller's first credit-account creation atomically creates a 20-credit balance and an immutable `grant` ledger entry with `grantReason: "seed"`.
- Balance is stored in `credit_accounts`; `credit_ledger_entries` is the immutable audit trail. All credit quantities are non-negative integers.
- Debit idempotency is scoped by `(sellerId, idempotencyKey)`. The key is bound to its original `runId` and `action`. An identical replay returns the persisted canonical result, including a rejected insufficient-credit result, with no `replayed` flag and no second debit.
- Reusing a debit key with a different `runId` or action returns `idempotency_conflict` and must not start another expensive operation. An identical replay/reconnect also must not restart the operation; the original run is resumed through C6 semantics.
- The debit transaction order is: claim the idempotency key with an internal `pending` database row; lock the account row; resolve and check the server-owned cost; then either finalize a rejected decision without changing balance, or atomically decrement balance, increment version, append a debit ledger entry, and finalize the applied decision. Internal `pending` rows are never returned as `CreditDebitResult`.
- Credit is checked before creating/sending an MA operation or invoking Seedream. Insufficient credit is returned as the structured `InsufficientCreditError` JSON body with HTTP 402; no C4 event is added and no MA/Seedream call occurs.
- If an applied debit's downstream MA/Seedream operation fails, the service automatically restores the full cost with one compensating immutable `grant` entry having `grantReason: "refund"` and `originalDebitDecisionId` equal to the applied decision. The refund is idempotent: at most one refund entry may reference a debit decision. Its idempotency key must be distinct from the original debit's key so the debit and refund never collide on `(sellerId, idempotencyKey)`.
- All model, embedding, and image work continues through the existing BytePlus ModelArk Managed Agent boundary. Seedream is never called directly.

### Publication rules

- Publishing is unmetered. It does not read or mutate credit balance.
- The BFF validates that the authenticated seller owns `projectId`; `seller_projects` is otherwise unchanged. C2 does not persist generated designs there. The publish request carries the design payload directly.
- Publication idempotency is scoped by `(sellerId, idempotencyKey)`. Reserve a `pending` publication row before any provider call; only the reservation winner may invoke Printerval.
- An identical publication replay returns the same persisted canonical result, including failure, with no `replayed` flag. A deliberate retry after failure requires a new idempotency key.
- No real Printerval API schema is claimed in C2. Recorded adapter fixtures must use `ProvisionalPrintervalPublishingFixture` and keep `fixtureStatus` as the literal `"provisional"`. Real-API verification is a later Phase C milestone.
- All future Printerval HTTP is isolated to the single `src/adapters/printerval/*` publishing client. Printerval is a business provider, not a model endpoint.
- MVP passes the Seedream URL as `design.assetUrl`. This is explicit technical debt: replace it with a durable BytePlus TOS object key before enabling real publishing.

### Backend environment names

- `PRINTERVAL_API_BASE_URL`
- `PRINTERVAL_API_KEY`
- Existing `DATABASE_URL` and `ARK_*` variables are reused. Printerval credentials remain backend-only.

## C8. Monitoring

C8 is additive. It does not modify C1–C7 types or semantics, including C4 events and C7 decisions, ledgers, or refunds. `CrawlSource`, crawl mode, SSE event types, and `CreditAction` are reused from their frozen contracts.

```typescript
import type { CrawlRequest, CrawlSource } from "./crawl";
import type { CreditAction } from "./monetization";
import type { UiEvent } from "./ui-event";

export type InfrastructureComponent =
  | "modelark"
  | "postgres"
  | "warehouse"
  | "printerval";

export type ModelArkOperation =
  | "session_attach_or_create"
  | "history_read"
  | "event_stream"
  | "send"
  | "interrupt"
  | "submit_tool_result";

export type PostgresOperation =
  | "trend_card_exact_query"
  | "seed_embedding"
  | "trend_card_semantic_query";

export type WarehouseOperation = "ma_recommendation";
export type PrintervalOperation = "publish";
export type InfrastructureOperationOutcome = "success" | "error" | "cancelled";

export type InfrastructureOperationLabels =
  | {
      component: "modelark";
      operation: ModelArkOperation;
      outcome: InfrastructureOperationOutcome;
    }
  | {
      component: "postgres";
      operation: PostgresOperation;
      outcome: InfrastructureOperationOutcome;
    }
  | {
      component: "warehouse";
      operation: WarehouseOperation;
      outcome: InfrastructureOperationOutcome;
    }
  | {
      component: "printerval";
      operation: PrintervalOperation;
      outcome: InfrastructureOperationOutcome;
    };

export type LiveRequestKind = "trend_card" | "generate_design" | "deep_dive";
export type LiveDeliveryPath =
  | "cache_hit"
  | "managed_agent"
  | "credit_rejected"
  | "credit_conflict";
export type LiveRequestOutcome = "success" | "error" | "cancelled";

export interface LiveRequestLabels {
  requestKind: LiveRequestKind;
  deliveryPath: LiveDeliveryPath;
  outcome: LiveRequestOutcome;
}

export type SseStreamOutcome = "done" | "fatal_error" | "cancelled";
export interface SseStreamLabels {
  outcome: SseStreamOutcome;
}

export type MonitoringSseEventType = UiEvent["type"] | "unmapped";
export type SseEventDisposition =
  | "emitted"
  | "deduplicated"
  | "ignored_unmapped";

export interface SseEventLabels {
  eventType: MonitoringSseEventType;
  disposition: SseEventDisposition;
}

export type CrawlMode = CrawlRequest["mode"];
export type CrawlSourceOutcome = "success" | "empty" | "failure" | "incomplete";
export type CrawlStage = "adapt" | "execute" | "normalize" | "final_card";

export interface CrawlSourceRunLabels {
  source: CrawlSource;
  mode: CrawlMode;
  outcome: CrawlSourceOutcome;
  stage: CrawlStage;
}

export interface CrawlSourceDurationLabels {
  source: CrawlSource;
  mode: CrawlMode;
  outcome: CrawlSourceOutcome;
}

export interface CrawlRecordsLabels {
  source: CrawlSource;
  mode: CrawlMode;
}

export type TrendCardBuildOutcome =
  | "complete"
  | "degraded"
  | "zero_evidence"
  | "failure";

export interface TrendCardBuildLabels {
  mode: CrawlMode;
  outcome: TrendCardBuildOutcome;
}

export type MissingSourceReason = "error" | "empty" | "unknown";

export interface TrendCardMissingSourceLabels {
  source: CrawlSource;
  mode: CrawlMode;
  reason: MissingSourceReason;
}

export type CreditDecisionOutcome = "applied" | "rejected" | "conflict";

export interface CreditDecisionLabels {
  action: CreditAction;
  outcome: CreditDecisionOutcome;
}

export interface CreditDebitLabels {
  action: CreditAction;
}

export type CreditRefundReason = "downstream_failure";

export interface CreditRefundLabels {
  action: CreditAction;
  reason: CreditRefundReason;
}

export type MeteredOperationOutcome =
  | "succeeded"
  | "failed_refunded"
  | "replay_not_started";

export interface MeteredOperationLabels {
  action: CreditAction;
  outcome: MeteredOperationOutcome;
}

export interface MetricLabelsByName {
  ptv_infra_operation_total: InfrastructureOperationLabels;
  ptv_infra_operation_duration_ms: InfrastructureOperationLabels;
  ptv_live_request_total: LiveRequestLabels;
  ptv_live_request_dispatch_duration_ms: LiveRequestLabels;
  ptv_sse_stream_total: SseStreamLabels;
  ptv_sse_event_total: SseEventLabels;
  ptv_crawl_source_run_total: CrawlSourceRunLabels;
  ptv_crawl_source_duration_ms: CrawlSourceDurationLabels;
  ptv_crawl_records_total: CrawlRecordsLabels;
  ptv_trend_card_build_total: TrendCardBuildLabels;
  ptv_trend_card_missing_source_total: TrendCardMissingSourceLabels;
  ptv_credit_decision_total: CreditDecisionLabels;
  ptv_credits_debited_total: CreditDebitLabels;
  ptv_credits_refunded_total: CreditRefundLabels;
  ptv_metered_operation_total: MeteredOperationLabels;
}

export type MetricName = keyof MetricLabelsByName;

export type CounterMetricName =
  | "ptv_infra_operation_total"
  | "ptv_live_request_total"
  | "ptv_sse_stream_total"
  | "ptv_sse_event_total"
  | "ptv_crawl_source_run_total"
  | "ptv_crawl_records_total"
  | "ptv_trend_card_build_total"
  | "ptv_trend_card_missing_source_total"
  | "ptv_credit_decision_total"
  | "ptv_credits_debited_total"
  | "ptv_credits_refunded_total"
  | "ptv_metered_operation_total";

export type DistributionMetricName =
  | "ptv_infra_operation_duration_ms"
  | "ptv_live_request_dispatch_duration_ms"
  | "ptv_crawl_source_duration_ms";

interface MetricObservationBase {
  value: number;
  observedAt: string;
  observationId?: string;
}

export type CounterMetricObservation = {
  [Name in CounterMetricName]: MetricObservationBase & {
    name: Name;
    kind: "counter";
    labels: MetricLabelsByName[Name];
  };
}[CounterMetricName];

export type DistributionMetricObservation = {
  [Name in DistributionMetricName]: MetricObservationBase & {
    name: Name;
    kind: "distribution";
    labels: MetricLabelsByName[Name];
  };
}[DistributionMetricName];

export type MetricObservation =
  | CounterMetricObservation
  | DistributionMetricObservation;

export type MonitoringThresholdGroup = "infrastructure" | "crawl" | "cost";
export type MonitoringThresholdStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "insufficient_data";
export type MonitoringThresholdOperator =
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal";

export interface MonitoringThresholdBoundary {
  operator: MonitoringThresholdOperator;
  value: number;
}

export interface MonitoringEvaluationWindow {
  from: string;
  to: string;
}

export interface MonitoringThresholdEvaluation {
  ruleId: string;
  group: MonitoringThresholdGroup;
  status: MonitoringThresholdStatus;
  observedValue: number;
  configuredBoundary: MonitoringThresholdBoundary;
  evaluationWindow: MonitoringEvaluationWindow;
}

/**
 * Metric labels are a bounded aggregation surface. Seller IDs, run IDs, seeds,
 * idempotency keys, URLs, model IDs, error messages, markets, and other
 * high-cardinality identifiers must never be placed in labels.
 *
 * When observationId is present, an implementation must ignore every later
 * observation carrying the same observationId.
 */
export interface MetricSink {
  record(observation: MetricObservation): void;
}
```

Contract rules:

- Metric names and every metric's labels are closed to the vocabulary above. New names or label values require an additive contract revision.
- Labels must never contain seller IDs, run IDs, seeds, idempotency keys, URLs, model IDs, error messages, markets, or other high-cardinality identifiers.
- `observationId` is metadata, not a label. When it is present, a `MetricSink` must record only its first occurrence and ignore every later observation with the same ID.
- `MetricSink.record` is synchronous and observational. Monitoring must not change application payloads, event ordering, credit behavior, or graceful-degradation behavior.
