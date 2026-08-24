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

## Suggested parallelism
After Phase A gate: B1, B2, B3, B5, B8 can start simultaneously (disjoint dirs). B4 waits on B1/B2 record shape; B6 pairs with B8 via C4 contract; B7 can start anytime after A2. Merge each via the queue.
