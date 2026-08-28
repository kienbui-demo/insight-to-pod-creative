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
