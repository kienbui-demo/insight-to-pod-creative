# Tasks — vertical slices + ownership map

> Rule: 1 feature = 1 worktree = 1 agent session = 1 PR. Sub-tasks run sequentially inside the feature's worktree. Two features that touch the same file → serialize. Contracts (contracts.md) must be FROZEN before any parallel feature starts.

## Phase A — Foundation (SERIAL, one agent, must finish first)

These create the shared surface everything else depends on. Do NOT parallelize.

- **A1. Repo skeleton + tooling** — Next.js+TS+Tailwind+shadcn, lint/typecheck/test config, folder layout, `AGENTS.md`/`CLAUDE.md` → constitution.
- **A2. Freeze contracts as code** — turn contracts.md (C1–C5) into `packages/contracts/*.ts` types + the initial Postgres migration `0001`. This is the freeze point.
- **A3. Config module** — `scoring.config.ts`, `CACHE_SIM_THRESHOLD`, source thresholds, credit costs. Central, typed.

> ⛔ GATE: A1–A3 merged to main before Phase B opens.

## Phase B — Parallel features (each = own worktree/PR, minimal file overlap)

Ownership map (owner dirs are exclusive):

| Feature | Owner dir(s) | Depends on | Lane | Notes |
|-|-|-|-|-|
| **B1. Culture adapters** (Trends/Reddit/Pinterest/TikTok) | `src/adapters/culture/*` | A2 | 🟡 TDD | one adapter per file; G3 tests |
| **B2. Commerce adapters** (Amazon/Etsy/Meta) | `src/adapters/commerce/*` | A2 | 🟡 TDD | Rainforest+Apify keys backend-only; G3 tests |
| **B3. Opportunity scoring** | `src/scoring/*` | A2, A3 | 🔴 Full TDD | G1 golden-set FIRST |
| **B4. Warehouse builder (cron)** | `src/warehouse/*` | A2, B1/B2 contracts | 🔴 Full TDD | MA does synthesis; cron does IO; G5 degrade tests |
| **B5. Cache + storage layer** | `src/storage/*` | A2 | 🔴 Full TDD | G2 threshold tests; pgvector lookup |
| **B6. BFF router + SSE translator** | `src/bff/*` | A2 (C4) | 🔴 Full TDD | G4 mapping tests; holds backend keys |
| **B7. MA session + Seedream tool** | `src/agent/*` | A2 | 🟡 TDD | 3 activation triggers; Seedream custom tool |
| **B8. Creator UI (4 screens)** | `app/*`, `src/ui/*` | A2 (C3,C4) | 🟢 Verify | consumes contracts via mocks until B6 ready |

Serialize hotspots (global mutex — one owner or append-only):
- Postgres migrations (append-only, timestamp-named).
- `packages/contracts/*` (frozen; change = stop-the-world).
- Any DI/route registry / barrel `index.ts`.

## Phase C — Integration (SERIAL)

- **C1. Wire UI ↔ BFF ↔ MA/warehouse** end-to-end (replace mocks).
- **C2. Monetization** — Publish-to-Printerval action + credit debits.
- **C3. Monitoring** — 3 groups (infra / crawl success / cost).
- **C4. Acceptance run** — the 3 acceptance signals in spec.md §8.

### C2 ownership and touched-files map

| Feature | Owner dir(s) / shared files | Depends on | Lane | Status |
|-|-|-|-|-|
| **C2. Monetization** — Publish-to-Printerval action + credit debits | `src/monetization/*`, `src/adapters/printerval/*`; shared C2 files listed below | C1 | 🔴 Full TDD after C7 freeze | Contract freeze in review |

C2 owns these shared-file changes for the duration of the serial Phase C feature:

- Contract freeze: `contracts/contracts.md`, `packages/contracts/monetization.ts`, `packages/contracts/index.ts`, `packages/config/credits.config.ts`, one append-only `packages/contracts/migrations/<UTC>_monetization.sql`, `.env.example`.
- RED/implementation after the C7 freeze is approved: `src/bff/types.ts`, `src/bff/router.ts`, `src/integration/live-route.ts`, a new in-memory-testable publish-handler factory under `src/integration/*`, and the C2 UI files/tests under `src/ui/*`.
- C2 does not own a real `app/api/live/route.ts` composition root and does not persist generated designs into `seller_projects`.
- Frozen C3 `TrendCard` and C4 `UiEvent` contracts are excluded from C2 changes.

### C3 ownership and touched-files map

| Feature | Owner dir(s) / shared files | Depends on | Lane | Status |
|-|-|-|-|-|
| **C3. Monitoring** — infrastructure health, crawl success, and cost | `src/monitoring/**`, `src/monitoring/__tests__/**`, `packages/contracts/monitoring.ts`, `packages/config/monitoring.config.ts`; shared C3 files listed below | C1, C2 (C7) | 🔴 Full TDD after C8 freeze; G3/G4/G5 coverage | Contract freeze in review |

C3 has exclusive ownership of:

- `src/monitoring/**` and `src/monitoring/__tests__/**`.
- `src/**/__tests__/*.c8.test.ts` (C3-owned, additive new files only).
- `packages/contracts/monitoring.ts` and `packages/config/monitoring.config.ts`.

C3 reserves these shared files for serialized, additive-only changes:

- Ownership and additive contract/export files: `specs/tasks.md`, `contracts/contracts.md`, `packages/contracts/index.ts`, and `packages/config/index.ts`.
- Existing runtime instrumentation points: `src/warehouse/types.ts`, `src/warehouse/trend-card-builder.ts`, `src/agent/modelark-managed-agent-client.ts`, `src/agent/modelark-live-session.ts`, `src/bff/types.ts`, `src/bff/router.ts`, `src/bff/sse-stream.ts`, `src/integration/live-route.ts`, `src/storage/postgres-trend-card-repository.ts`, `src/monetization/credit-service.ts`, and `src/monetization/publish-service.ts`.
- Each existing runtime shared-file edit is limited to adding a single `metricSink.record(...)` call-site, with no reordering, payload change, or behavior change.

C3 will NOT touch:

- Frozen C1–C7 types or semantics, including C4 events and C7 ledger/refund behavior.
- Existing migrations or any new monitoring migration.
- Adapter provider mapping or normalization files.
- Scoring, cache-decision, UI, or app-screen code.
- `.env.example`, Next.js/package versions, or lint/build configuration.
- A real composition root, monitoring backend, listener, endpoint, timer, or dashboard.
- Real Printerval integration or ModelArk/Seedream invocation behavior.
- `npm audit fix`.

## Suggested parallelism
After Phase A gate: B1, B2, B3, B5, B8 can start simultaneously (disjoint dirs). B4 waits on B1/B2 record shape; B6 pairs with B8 via C4 contract; B7 can start anytime after A2. Merge each via the queue.
