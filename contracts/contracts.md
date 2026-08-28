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
