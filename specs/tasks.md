# Tasks — vertical slices + ownership map

> Rule: 1 feature = 1 worktree = 1 agent session = 1 PR. Sub-tasks run sequentially inside the feature's worktree. Two features that touch the same file → serialize. Contracts (contracts.md) must be FROZEN before any parallel feature starts.

## Working model — Architect (Claude) ↔ Codex CLI (source-of-truth roles & rules)

> Recorded here per constitution rule 7 (no design/process decision lives only in chat). This is the durable, authoritative description of how the two agents collaborate on this repo. Updated 2026-09-06.

**Roles**

- **Architect (Claude / Mira)** — owns the repo's *intent*: reads the repo, controls `specs/spec.md` and `specs/tasks.md` as source-of-truth, decides scope and execution order, writes the requirements/prompts (including test requirements) for Codex, reviews Codex's plan + RED/GREEN + diffs, verifies independently (re-reads changed files, re-runs tsc/eslint/vitest), and is the ONLY party that runs `git add`/`git commit` — from the outer WSL shell, with explicit paths. The architect does NOT write production code directly.
- **Codex CLI** — the executor that edits code directly on the user's machine (WSL) inside `~/ptv-agent`. Codex writes production + test code following TDD (RED first) or Verify-by-running, per the architect's brief. Codex CANNOT commit: its `.git` is mounted read-only in its sandbox, so all staging/commits are done by the architect from the outer shell.

**Rules of engagement**

1. **Spec/tasks are source-of-truth.** Every landed change is reflected here and in `specs/spec.md` before/at commit time. No decision survives only in chat.
2. **TDD is mandatory for behavior** (constitution rule 8): RED test first, then implement to GREEN. Verify lane allowed for pure UI/wiring characterization.
3. **Contracts stay frozen** unless an explicit, scoped, user-approved unlock is recorded in this file (see the Phase D / Phase E unlock blocks). Re-freeze after merge.
4. **Explicit-path commits only.** Never `git add -A`. Never stage diagnostics/scratch (`.codex-b64-*.txt`, `.codex-brief-*.txt`, `backfill_embeddings.mjs`, `diag-*.mts`, `verify_similar.mjs`). Never amend prior commits. No `npm audit fix`, no package version bumps.
5. **Architect verifies, does not trust.** Codex's summary is a claim; the architect re-reads the actual diff and re-runs the checks before committing.
6. **Codex invocation** is single-line prompts over `wsl.exe bash -lc "cd ~/ptv-agent && codex exec -c sandbox_mode=workspace-write -c approval_policy=never '<one-line prompt>' </dev/null 2>&1"` (no literal newlines — they break the cmd→WSL→bash layering). If Codex stops for plan approval, the architect reviews the plan and relaunches with "PLAN ALREADY APPROVED … execute now, do not ask again."

### File-transfer protocol (Mira ↔ WSL) — standard channel + safety gate

> Recorded per constitution rule 7. This is the authoritative way the architect pushes any file (spec/tasks/brief) from the Mira sandbox into the repo on the user's WSL machine. Adopted 2026-09-06.

**Why a protocol at all.** The Mira `Bash` tool runs in a REMOTE sandbox with no shared mount to the user's machine; the only channel is the local MCP tool, which runs in Windows `cmd.exe` (minimal PATH — invoke WSL via full path `C:\Windows\System32\wsl.exe bash -lc "…"`). `cmd.exe` caps a command line at ~8191 chars, so inlining a file's content, or base64-chunking it, is fragile (silent mid-string truncation, no integrity check).

**Standard channel — upload + curl + MD5 (use this, not base64 chunking):**

1. In the sandbox, generate the file, then call the `upload_file` tool → returns a signed TOS URL + the file's MD5.
2. In WSL, fetch by the short URL only (nothing large crosses the cmd→WSL boundary): `curl -fsSL '<URL>' -o <dest>.new`. Pass the signed URL VERBATIM as `upload_file` returned it (the signature is masked in the architect's context; retyping it yields HTTP 403).
3. Integrity-check: `md5sum <dest>.new` and compare byte-for-byte to the upload's MD5. Proceed ONLY on an exact match.

**Mandatory diff + verify BEFORE any repo update (hard gate — never skip):**

4. Never overwrite the tracked file directly from `.new`. First diff it against the live file: `diff -u <dest> <dest>.new` (or `git --no-pager diff --no-index <dest> <dest>.new`). Read the whole diff; confirm it changes exactly what was intended and touches no frozen contract.
5. Only after the diff is reviewed and the MD5 matched, apply it (`cat <dest>.new > <dest>`), then re-run the relevant checks (tsc/eslint/vitest for code; a re-read for docs).
6. Commit with explicit paths only (never `git add -A`); do NOT stage the `.new` scratch file or any diagnostics. Clean up `<dest>.new` after. Use a single `-m` commit message (a two-`-m` invocation over the cmd→WSL boundary trips a false-positive path guard on `C:\Windows`).

**Security caveat.** Signed TOS URLs are fetchable by anyone holding them until expiry, so this channel is for non-sensitive artifacts (spec/tasks/briefs) ONLY — never secrets, keys, `.env*`, or credentials.

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

### C4 ownership and touched-files map

| Feature | Owner dir(s) / shared files | Depends on | Lane | Status |
|-|-|-|-|-|
| **C4. Acceptance run** — prove the three §8 acceptance signals | `tests/acceptance/**`; shared ownership entry in `specs/tasks.md` | C1, C2, C3 | 🔴 Acceptance tests; G4/G5 RED first | Phương án A — RED |

C4 has exclusive ownership of:

- `tests/acceptance/**/*.test.ts`.
- `tests/acceptance/support/c4-acceptance-harness.ts`.

C4 reserves one serialized, additive-only shared-file change:

- `specs/tasks.md` for this ownership block.

C4 authorized corrective scope (Phương án A), exact files to be pinned after RED:

- Minimal scoring/warehouse confidence-path edits required so confidence lowers when a source is missing.
- Minimal C1 integration/wiring-path edits required so opportunities are presented ranked and the seller journey composes at the assembled-logic boundary.
- Wiring/ranking corrective file pinned after RED: `src/integration/rank-opportunities.ts`.

Follow-up (B8): Discover UI still renders mock `TREND_CARDS` and does not consume `rankOpportunities`; wiring the ranked list into the Discover screen is deferred to B8, out of C4 scope.

C4 will NOT touch:

- `contracts/contracts.md`, `packages/contracts/**`, or frozen C1–C8 contracts.
- `packages/config/**`, migrations, or `.env.example`.
- Adapter provider mapping or normalization files.
- Any production module outside the two authorized corrective areas above.
- Real network clients, API keys, model/Seedream/Printerval calls, HTTP servers, or port binding.
- Package versions, build configuration, or lint configuration.
- `npm audit fix`.

## Suggested parallelism
After Phase A gate: B1, B2, B3, B5, B8 can start simultaneously (disjoint dirs). B4 waits on B1/B2 record shape; B6 pairs with B8 via C4 contract; B7 can start anytime after A2. Merge each via the queue.

## Phase D — Real-API integration (P-series, post-MVP "grill")

> Context: Phase A/B/C above froze the MVP build plan (mocked/stubbed transports). During the real-API integration phase (Apify + ModelArk + Seedream + Postgres), a follow-up series P1–P8 emerged to replace mocks with live transports and wire the composition root. This block back-ports that series into tasks.md so this file stays the single source of truth. Same rule holds: contracts frozen; explicit-path commits; serialized hotspots.

Frozen files (do NOT modify): `src/bff/types.ts`, `src/integration/live-route.ts`, `src/ui/live-theater/*`, `src/bff/router.ts`, `src/integration/live-dependencies.ts`, `src/integration/env-config.ts`, `packages/contracts/*`, all `.env*` files, and the `submitCustomToolResult` wire-shape in `src/agent/modelark-managed-agent-client.ts`.

> WARNING: P9/P10 authorized unlock (user-approved 2026-09-06): `src/integration/live-dependencies.ts` is temporarily unlocked ONLY to wire `TrendCardLookupPort` into the live session and add the card-persisting write path. `src/bff/router.ts`, `src/bff/types.ts`, `src/integration/live-route.ts`, `packages/contracts/*`, and `.env*` stay frozen. Re-freeze `live-dependencies.ts` after P9/P10 merge.

| ID | Feature | Owner dir(s) | Status | Notes |
|-|-|-|-|-|
| **P1** | Replace mock TREND_CARDS with real warehouse data in UI | `app/page.tsx`, `src/ui/*` | 🟢 Done | Warehouse-only. Deleted `src/ui/mocks/trend-cards.ts`; removed `findTrendCard` fallbacks (detail routes now `findById` → `notFound`); `page.tsx` returns `[]` + `source="empty"` when no `DATABASE_URL`; Discover renders empty-state; `MOCK_CARD_ID` nav entries removed (keep Discover). tsc/eslint/vitest(452) green. Commit `e9889a7`. |
| **P2** | Wire Publish-to-Printerval (FR5 GMV action) | `src/monetization/*`, `src/integration/*` | 🟡 Done (SIMULATED) | End-to-end publish is simulated (commit 9c8cb57). `src/adapters/printerval/` does NOT exist — no real Printerval API call yet. |
| **P3** | Credit metering + seller authentication for metered actions | `src/monetization/*`, `src/integration/live-dependencies.ts` | 🔴 **DEFERRED → Phase 2** | Per spec.md §7. Contracts + `packages/config/credits.config.ts` + DB tables (`credit_accounts`, `credit_debit_decisions`, `credit_ledger_entries`) EXIST but are NOT wired: `buildLiveDependencies` returns no `credits`/`authenticateSeller`, so `live-route.ts` runs the UNMETERED path (guarded by its `monetized` check, lines 160-168 — not a crash). Deferred work: (a) real `PostgresCreditRepository` (5-method contract, idempotency + optimistic locking `version` column + refund-on-failure); (b) seller-auth mechanism (none exists app-wide — needs arch decision: stub / header / real auth); (c) wire both into `buildLiveDependencies`. |
| **P4** | Persist generated designs into `seller_projects` | `src/integration/live-dependencies.ts`, `src/storage/*` | 🟢 Done (verified) | Wired via `PostgresSellerProjectRepository` + `createPersistingLiveSessionPort` (saves on first `seedream_image` for `generate-design`). Verified live: 11 real rows in `seller_projects`, each with a Seedream `design_asset_url`. |
| **P5** | Warehouse ingestion job (nạp trend_cards + backfill embedding) | `src/warehouse/*`, `src/storage/*` | 🟢 Done | Write path: ingest trend_cards + backfill pgvector embeddings. |
| **P6** | Wire Design Studio UI → generate-design (MA + Seedream thật) | `app/*`, `src/ui/*`, `src/agent/*` | 🟢 Done | Live generate-design lane: crawl → MA session → real Seedream image. |
| **P7** | Wire Deep-dive UI → deep-dive question (MA thật) | `app/*`, `src/ui/*`, `src/agent/*` | 🟢 Done | Live deep-dive lane: crawl → answer. |
| **P8** | Live e2e test lane (Apify + MA + Seedream thật) | `tests/live/*` | 🟢 Done | Opt-in, env-gated (`RUN_LIVE_TESTS=1` / `RUN_LIVE_DEEPDIVE=1`); excluded from default vitest. |
| **P9** | Generate-design warehouse-first (no live crawl) | `src/agent/modelark-live-session.ts`, `src/integration/live-dependencies.ts`, `src/agent/warehouse-crawl-records.ts` | 🟢 Done | FR8. generate-design now resolves the warehouse card via `TrendCardLookupPort` in `send()`; on a hit the MA `crawl` tool is served from `warehouseCrawlRecords(card, source)` (new pure helper synthesizing one `CanonicalRecord` per source, `payload.fromWarehouse=true`) with metric label `mode:"warehouse"`; on a miss it falls back to the existing live Apify path (`mode:"live"`). `trend-card`/`deep-dive` never set `servedCard` → stay live. MA still runs to build the Seedream prompt. Frozen contracts untouched (warehouse `mode` label added via a local cast, no C8 schema change). tsc + eslint(P9 files) + vitest(457, incl. new `modelark-live-session.warehouse-first.p9.test.ts` 5 tests) green. |
| **P10** | Seller-authored trend cards (create + persist to warehouse) | `src/integration/persisting-trend-card-live-session-port.ts`, `src/integration/live-dependencies.ts`, `src/ui/discover/seed-authoring-panel.tsx`, `src/ui/discover/discover-screen.tsx` | 🟢 Done | FR9. New `SeedAuthoringPanel` (controlled topic/market/productType form, explicit SSE submit, no mount-time auto-fire) replaces the Discover auto-scan. A new `createPersistingTrendCardSessionPort` decorator taps `final_card` on `trend-card` runs, embeds the normalized seed (`trim().toLowerCase()`, mirrors ingest/findSimilar) and saves to `TrendCardRepository` — save-once, best-effort (embed/save failure never interrupts the MA event stream), all events pass through unchanged. `live-dependencies` hoists a shared embeddings provider + `PostgresTrendCardRepository` so read (lookup) and write (persist) share one instance, wrapping the project-persistence decorator, gated on `DATABASE_URL`. Frozen contracts + `router.ts` untouched. tsc + eslint(P10) + vitest(492, incl. 5 decorator + 2 seed-form + 1 DATABASE_URL-gated wiring cases) green. Commit `6222548`. |

### Phase D follow-ups (live-lane hardening)

| Fix | Area | Status | Commit |
|-|-|-|-|
| MA decoder benign-ack bug | `src/agent/*` | 🟢 Done | — |
| MA tool-result wire shape (`content`+`is_error`, not `result`) | `src/agent/*` | 🟢 Done | — |
| Parallelize image tool fulfillment in `pump()` (latency) | `src/agent/modelark-live-session.ts` | 🟢 Done | — |
| Fix deep-dive/generate-design live-lane HTTP 400 (dedup re-listed tool_use) | `src/agent/modelark-live-session.ts` + dedupe test | 🟢 Done | 6dd6404 |

### Remaining to complete the MVP product (active pending)

- **P1 (finish):** ✅ DONE (commit `e9889a7`) — mock `TREND_CARDS` / `MOCK_CARD_ID` fully removed; Discover/Studio/Deep-dive are warehouse-only.
- **P4 (verify):** ✅ DONE — verified against live Postgres: `seller_projects` holds 11 real rows, each with a Seedream `design_asset_url`, written via `createPersistingLiveSessionPort` on `seedream_image` events during live generate-design runs. Write path confirmed working end-to-end.
- Current plan order: P1 ✅ + P4 ✅ done. **Active work: P9 (generate-design warehouse-first, FR8) then P10 (seller-authored cards, FR9).** P3 remains DEFERRED to Phase 2.
- **P9 (FR8):** ✅ DONE — generate-design now serves the MA `crawl` tool from the matched warehouse card at the session layer (`servedCard` set in `send()` via `TrendCardLookupPort`), synthesizing `CanonicalRecord`s through the new pure `warehouseCrawlRecords` helper; no Apify call on a hit (verified: `FakeCrawlPort.calls` empty), live fallback preserved on a miss. `router.ts` and frozen contracts untouched. Next: **P10 (seller-authored cards, FR9)**.
- **P10 (FR9):** ✅ DONE — seller authors a card from a seed via `SeedAuthoringPanel`; on a genuine warehouse miss the synthesized `final_card` is now persisted to `trend_cards` (seed embedded + saved) by the `createPersistingTrendCardSessionPort` decorator, so the next seller's lookup hits. Best-effort persistence never interrupts the MA stream; design generation from the new card stays warehouse-first per P9. Commit `6222548`.

> Deferred to Phase 2 (out of MVP scope, spec.md §7): P3 credit metering + seller auth; real Printerval adapter (P2 hardening); Instagram/YouTube sources; full eval pipeline; multi-region/multi-language; per-seller trend-card ownership + a "My Trend Cards" tab (see below).
>
> **Per-seller trend cards / "My Trend Cards" tab (Phase 2 roadmap, requested 2026-09-06).** Current state (post-P10): `trend_cards` is a SHARED/global warehouse — keyed by id/seed/market, one shared `embedding`, NO `seller_id` column; FR9 authored cards land in this shared cache by design (author-once → next seller's lookup hits). A personalized "My Trend Cards" tab beside Discover (each seller sees only the cards they authored) is NOT built and needs, in order: (1) **contracts/migrations unlock** — add `seller_id` to `trend_cards` (or a join table); this is a FROZEN `packages/contracts/*` change requiring a scoped, user-approved unlock + a new migration (no destructive edit to `20260825023312_initial_contracts.sql`; add a forward migration). (2) **write path** — stamp `sellerId` (injected from the authenticated session, never from client JSON) in `createPersistingTrendCardSessionPort` when it saves an authored card. (3) **read path + UI** — a seller-scoped repository query (`findBySeller`) + a new tab/route rendering the seller's own cards. **Blocked-by:** the seller-auth mechanism is itself deferred (P3) — there is no app-wide seller identity today, so authorship cannot be attributed until an auth decision (stub / header / real auth) is made. **Trade-off to record for the decision:** a per-seller store weakens the shared-cache reuse that FR9 intentionally relies on; options include keep the shared cache AND additionally record authorship (a "My cards" view as a filtered slice over the shared table) vs. a separate per-seller store. Not started; no ID assigned; do not begin without explicit user approval.

## Phase E - Post-UI-test bug fixes (user-approved 2026-09-06)

> Context: after a manual UI test round, the seller (product owner) filed 4 bugs; Bug 2 (Postgres ECONNREFUSED on home page) is explicitly OUT of scope this round (SKIP). The remaining fixes map to FR10-FR13 (see spec.md). Execution is coordinated with Codex CLI over WSL under the same discipline: TDD (RED first), explicit-path commits, serialized hotspots, contracts stay frozen.

### Frozen-file unlock (Phase E scope only)

> AUTHORIZED UNLOCK (user-approved 2026-09-06, mirrors the P9/P10 pattern): to land E2 (multi-turn deep-dive) and E1 (deep-dive warehouse-first), the following otherwise-frozen files are temporarily unlocked ONLY for the minimal, explicitly-scoped edits below. `packages/contracts/*`, `src/bff/types.ts`, and all `.env*` stay FROZEN (no wire-shape / contract change). Re-freeze after the Phase E merge.
>
> - `src/bff/router.ts` - E1: extend the warehouse-lookup fast-path so `kind === "deep-dive"` on a warehouse hit is answered from stored card data (currently only `kind === "trend-card"` is looked up). Miss -> existing live path (author-a-card, FR9). No signature/return-shape change.
> - `src/ui/live-theater/*` - E2: allow the reducer / LiveTheater to be re-keyed per question turn so a second question is not blocked by the `done`/`failed` short-circuit. Additive turn handling only; no `UiEvent` contract change.
> - `src/ui/deep-dive/deep-dive-screen.tsx` - E2: replace the single `submittedQuestion` + single `<LiveTheater>` with a per-turn conversation (list of {question, runId, eventSource}); each new Ask appends a turn with its own runId.
> - `src/integration/live-dependencies.ts` - E3: swap `InMemoryRunSessionRepository` for a new `PostgresRunSessionRepository` (durable runId->maSessionId), gated on `DATABASE_URL` with in-memory fallback. (Stays unlocked from P9/P10.)
>
> NOT unlocked / untouched: `src/integration/live-route.ts`, `src/bff/types.ts`, `packages/contracts/*`, `.env*`, `env-config.ts`, `submitCustomToolResult` wire-shape.
>
> STATUS 2026-09-06: Phase E E1-E6 merged. E6 (`2829c1e`) implemented client-side (sessionStorage) with no frozen-file changes, so `live-dependencies.ts` was NOT touched and can be re-frozen. All Phase E unlocked files are re-frozen.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **E4** | Seller insight dashboard + text opportunity report (FR12) | `src/insights/derive-seller-insights.ts` (new, pure) + `src/insights/__tests__/*`; `src/ui/trends/trend-card-detail.tsx` | ✅ Done (`7faeb55`) | Full TDD | New pure `deriveSellerInsights(card)` computes demand/momentum, money/competition, confidence metrics from the card (no contract/DB change); detail screen renders an Insight Dashboard block + a 6-section Opportunity Report block. RED tests first (golden card fixtures: retro-halloween-cats et al.). DO FIRST - lowest coupling, no frozen files. |
| **E2** | Multi-turn deep-dive chat (FR11, part 1) | `src/ui/deep-dive/deep-dive-screen.tsx`, `src/ui/live-theater/*` | ✅ Done (`7e8ef0e`) | Verify + RED | Per-turn conversation state; re-key LiveTheater per turn; second Ask appends a new turn with its own runId instead of no-op. RED test on the reducer/turn model first. Uses Phase E unlock. |
| **E1** | Deep-dive warehouse-first, no re-crawl (FR10) | `src/bff/router.ts` + `src/bff/__tests__/*` | ✅ Done (`21baac9`) | Full TDD | Extend cache fast-path to `deep-dive` on a warehouse hit (answer from stored card); genuine miss -> live author-a-card path (FR9). RED mapping test: existing card deep-dive => `FakeCrawlPort.calls` empty. Uses Phase E unlock. |
| **E3** | Durable deep-dive session persistence (FR11, part 2) | `src/integration/postgres-run-session-repository.ts` (new) + tests; `src/integration/live-dependencies.ts` | ✅ Done (`b341876`) | Full TDD | Implement `PostgresRunSessionRepository` against the EXISTING `ma_run_sessions` table (migration `20260828054035_ma_run_sessions.sql`: run_id PK, ma_session_id UNIQUE, timestamps). Wire in composition root, gated on `DATABASE_URL`, in-memory fallback otherwise. RED repository round-trip test first. |
| **E5** | Real reference images (FR13) | `packages/contracts/seed/dev-trend-cards.sql`, `next.config.ts` | ✅ Done (`4a7561c`) | Verify | Replaced `tos.example` placeholder image URLs in dev seed with real loadable Wikimedia Commons `Special:FilePath` URLs; added `commons.wikimedia.org` + `upload.wikimedia.org` to the `next.config` image host allowlist. Note: real adapters (`pinterest-adapter`/`tiktok-adapter`) already extract `referenceImageUrls` from live data - this fix is about seed fixtures + host allowlist so warehouse-served cards do not show broken images. |

### Phase E test-hardening (architect-required, after E1-E5)

> Commit `3158ec9` — "test(phase-e): lock FR12 detail UI, FR11 durable-session wiring, FR13 image hosts; characterize FR11 nav-persistence gap". Architect wrote the test requirements, Codex implemented under TDD/Verify, architect re-verified (re-read the two integration tests, re-ran tsc/eslint clean, full suite 90 files / 479 tests green = 473 baseline + 6 new) then committed with explicit paths.

| Test | Guards | File | Status |
|-|-|-|-|
| **D1** | FR12 detail-UI render (dashboard + 6-section report + "Act now" badge) | `src/ui/trends/__tests__/trend-card-detail.test.tsx` | ✅ Green |
| **D2** | FR11-p2 wiring — `PostgresRunSessionRepository` when `DATABASE_URL` present, `InMemoryRunSessionRepository` when absent (constructor-options capture) | `src/integration/__tests__/live-dependencies.run-session-wiring.test.ts` | ✅ Green (2 tests) |
| **D3** | FR13 regression — seed SQL has no `tos.example` + has `commons.wikimedia.org`; `next.config.ts` allows `commons.wikimedia.org` + `upload.wikimedia.org` | `src/integration/__tests__/reference-image-hosts.test.ts` | ✅ Green (2 tests) |
| **D4** | FR11-p1 nav-persistence — now a positive ASSERTION (flipped from characterization in E6 `2829c1e`): prior turns survive remount and rehydrate without re-fetch (FR10) | `src/ui/deep-dive/__tests__/deep-dive-screen.test.tsx` (extended) | ✅ Green (assertion) |

### E6 — FR11 deep-dive nav-persistence (✅ DONE `2829c1e`)

> Architect finding: FR11 requires the deep-dive conversation to persist **across navigation** (leave the card and return → prior turns re-shown) AND **across process restarts**. E3 (`b341876`) satisfies the *restart* half (durable runId→MA-session in Postgres). The *navigation* half is NOT implemented: `deep-dive-screen.tsx` holds `turns` in local React `useState`, so unmount (navigating away) drops the conversation. D4 characterizes this gap as GREEN documentation. E6 would flip D4 to a RED failing test, then implement to GREEN.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **E6** | Deep-dive turns persist across navigation (FR11 nav half) | `src/ui/deep-dive/deep-dive-persistence.ts` (NEW), `src/ui/live-theater/replay-ui-event-source.ts` (NEW), `src/ui/live-theater/recording-ui-event-source.ts` (NEW), `src/ui/deep-dive/deep-dive-screen.tsx`, + tests | ✅ Done `2829c1e` | Full TDD | **Chosen architecture: client-side persistence, no backend/contract change.** `ma_run_sessions` only stores the runId→MA-session mapping (no turn transcript), so reloading turns from Postgres was infeasible without unfreezing contracts. Instead: a `DeepDiveTurnStore` over injectable `sessionStorage` (keyed `deep-dive-turns:${card.id}`, SSR-safe in-memory fallback, malformed-JSON tolerant) records every streamed `UiEvent` via a recording-tee source and rehydrates prior turns on mount via a network-free replay source — satisfying FR10 (no re-crawl on return). D4 flipped to a passing assertion; 8 files, tsc/eslint/full-vitest (93 files, 484 tests) green. No frozen files touched. |

> SKIPPED this round (user decision 2026-09-06): Bug 2 - Postgres `ECONNREFUSED 127.0.0.1:5432` crashing the home page (`app/page.tsx` `listRecent(24)` with no try/catch). Not fixed now; revisit later.

### E7 — Trend-series chart renders empty (bar-height CSS collapse) (✅ DONE `13101b7`)

> User report 2026-09-06: on the trend-card detail screen the opportunity-score chart looked empty, and reference images still resolved to `tos.example`. Architect investigation against the LIVE system found two distinct causes, only one of which was a code bug.

> **Reference-images finding (ops, no code change):** E5 (`4a7561c`) corrected the seed SQL + `next.config.ts` host allowlist, but the running `ptv-pg` database was never re-seeded, so all three dev cards still held pre-E5 `tos.example/*` URLs. Re-applying `packages/contracts/seed/dev-trend-cards.sql` (idempotent `ON CONFLICT DO UPDATE`) replaced them with the real Wikimedia URLs. No source change. NOTE for future: dev DB must be re-seeded after any seed-SQL edit. Also note the dev cards are SEED data, not crawled — both trend series and reference images are fixtures; live crawl/Seedream paths only populate during a live run.

> **Chart finding (real CSS bug, TDD-fixed):** in `trend-card-detail.tsx` each bar used `height: N%`, but its column wrapper (`flex flex-1 flex-col items-center`) was auto-height, so the percentage resolved against an auto-height parent and collapsed to 0 — bars vanished while date labels still rendered (confirming the data was present: DB series 38/52/67/84). The `h-40` definite height lived on the outer row, not the column the bar measured against.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **E7** | Trend-series bars render with visible height (chart not collapsed) | `src/ui/trends/trend-card-detail.tsx`, `src/ui/trends/__tests__/trend-card-detail.test.tsx` | ✅ Done `13101b7` | Full TDD | Fix: give each chart column a definite-height reference by adding `h-full` + `justify-end` so the bar `%` resolves against the outer `h-40` (160px) row. No change to the height math, data source, colors, or `aria-label`. RED first: new test "renders a visible bar per trend-series point (chart not collapsed)" asserts one bar per data point, every bar has a non-empty inline `height` style > 0, the max-value point resolves to `100%` while a smaller point is < 100%, and each column carries `h-full` (structural regression guard — failed on old code, passes after fix). Verified independently by architect: tsc clean, eslint clean on both files, targeted test 2/2, full vitest 95 files / 493 tests green. 2 files, +38/-1. **User dropped the "last-week series" enhancement (Part B) — CSS-only fix.** |

### E8 — Trend chart y-axis scale + per-point hover tooltip (metric alias) (✅ DONE `c5309d9`)

> User request 2026-09-06 (after E7 made the bars visible): “cần thể hiện thang đo, khi di chuột vào cụ thể từng data point cần hiển thị thông tin metric (dạng alias) của cột dữ liệu đó.” The chart had no measure and no per-point readout.

> **Metric alias is UI-derived, not a contract field.** `trendSeries` stays FROZEN as `{ t: string; v: number }[]` — no per-point label exists in the data. The value `v` provably originates from the `google_trends` record’s `payload.trendSeries` (`src/warehouse/trend-card-builder.ts` `trendSeries()`), i.e. the Google Trends SEARCH-INTEREST index (0–100), so the correct alias is **“Search interest”** and the scale is a fixed 0–100 reference.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **E8** | Y-axis scale + per-point hover/focus tooltip (Search-interest alias, value, date) | `src/ui/trends/trend-card-detail.tsx`, `src/ui/trends/__tests__/trend-card-detail.test.tsx` | ✅ Done `c5309d9` | Full TDD | Two additive UI enhancements, no change to the bar-height math, 8% floor, colors, data source, or contract. **(A) Scale:** an axis column (`aria-label="Trend scale"`) with fixed ticks 100/75/50/25/0 laid out beside the `h-40` plot area, placed OUTSIDE the `aria-label="Trend series"` bars row so E7’s selectors are untouched. **(B) Tooltip:** each column wrapped in `group relative … tabIndex={0}` with an always-mounted `data-testid="trend-tooltip"` `role="tooltip"` node (CSS-only visibility: `hidden group-hover:block group-focus-within:block`, no inline height so it isn’t miscounted as a bar) showing “Search interest” + value + `formatDate(point.t)`; each column also carries `aria-label="Search interest {v} on {date}"`. RED first (proven independently): new test “renders a y-axis scale and a per-point tooltip with metric alias, value, and date” fails on pre-E8 source (`Unable to find a label with the text of: Trend scale`) while both existing tests stay green; asserts 5 ticks, exactly 5 tooltips, every tooltip contains “Search interest”, and the peak (55 / Sep 5, 2026) + first (20 / Aug 8, 2026) points each map to a tooltip. Verified independently by architect: tsc clean, eslint clean on both files, full vitest 95 files / 494 tests green; E7’s bar test still passes unchanged. 2 files, +80/-18. |

> Execution order (completed): **E4 ✅ -> E2 ✅ -> E1 ✅ -> E3 ✅ -> E5 ✅**, then test-hardening `3158ec9` ✅, then **E6 ✅ `2829c1e`** (FR11 navigation persistence, client-side sessionStorage), then **E7 ✅ `13101b7`** (trend-series chart bar-height CSS collapse; reference-images `tos.example` fixed by re-seeding the dev DB, no code change), then **E8 ✅ `c5309d9`** (trend chart y-axis scale + per-point hover/focus tooltip with the “Search interest” alias, value, and date). Rationale for original order: E4 had zero frozen-file coupling (fastest win + immediate seller value); E2/E1 shared the deep-dive lane; E3 was the durability backstop for E2; E5 was a small seed/config fix.

### E9 — Deep-dive hydration mismatch on reload (✅ DONE `930a4e6`)

> User report 2026-09-06: reloading the deep-dive page mid-conversation threw a React hydration error at `deep-dive-screen.tsx` (the `key={turn.runId}` map). Architect root-cause against the repo: `turnStore.load(card.id)` was called INSIDE the `useState` initializer (old lines 54–56), so it ran during SSR too — the server has empty `sessionStorage` → 0 turns, while the client after a reload has a populated store → N turns. Server HTML and first client paint disagreed → hydration mismatch. History persistence itself (E6) works; only the TIMING of the read was SSR-unsafe.

> **Label note:** this is the deep-dive hydration fix originally scoped as "E8" in the Codex brief, but the "E8" label was taken by the trend-chart y-axis/tooltip commit `c5309d9` (a stale brief `/tmp/codex-brief-e8.txt` that a concurrent Codex session replayed). To keep spec/tasks unambiguous the hydration fix is recorded here as **E9**. No contract, env, or migration touched.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **E9** | Deep-dive first render is SSR hydration-safe (persisted turns load after mount) | `src/ui/deep-dive/deep-dive-screen.tsx`, `src/ui/deep-dive/__tests__/deep-dive-screen.test.tsx` | ✅ Done `930a4e6` | Full TDD | Fix: `turns` now initializes empty (`useState<DeepDiveTurn[]>([])`) so server and first client paint agree; persisted turns are restored AFTER mount in a client-only `useEffect` keyed on `card.id` that also syncs `turnsRef.current` (keeps `recordEvent`/`updateTurns` consistent). `useEffect` added to the React import. No change to `updateTurns`, `save`, `submitQuestion`, or the render JSX. RED first (proven independently): new test "does not read persisted turns during initial render (SSR hydration-safe)" uses `renderToString` (runs the render body + useState initializer but NOT effects, exactly like the server) and asserts the persisted question is ABSENT from server HTML — it FAILED on old code (`expected '<div class="min-h-screen bg-slate-50"…' not to contain 'Persisted before reload?'`) while the 3 existing tests stayed green; the E6 "restores prior turns after remount" test still passes because Testing Library flushes effects inside `act()`. Verified independently by architect: targeted 4/4, tsc clean, eslint clean, full vitest 95 files / 495 tests green. 2 files, +29/-4. |

### E10 — Deep-dive conversation memory (reuse one runId per conversation) (✅ DONE `6e65834`)

> User report 2026-09-06 (Issue 2): the deep-dive chat has no short-term memory — each follow-up question was answered as if it were the first. Architect root-cause against the repo: `submitQuestion` minted a fresh `crypto.randomUUID()` runId for EVERY question (old `deep-dive-screen.tsx:89`). Since the MA session is resolved by runId (`resolveRunSession` → `findByRunId(runId)` in `run-session-coordinator.ts`), a new runId ⇒ `attachOrCreate` opens a brand-new Managed-Agent session with zero history. Reusing ONE conversation-level runId makes every follow-up land in the same MA session (durable mapping already shipped in E3), which is the memory. Note: `runId` was overloaded as the React key + event-recording key, so the fix splits it into a per-turn `turnId` (keys + `recordEvent` routing) and a per-conversation `runId` (the MA session identity).

> **Scope:** repo-only UI fix. No Postgres/env/contract/migration change. E3's durable runId→maSessionId mapping is the persistence layer; E10 just stops throwing away the runId per turn.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **E10** | Deep-dive reuses one conversation runId across all follow-up questions (short-term memory) | `src/ui/deep-dive/deep-dive-screen.tsx`, `src/ui/deep-dive/deep-dive-persistence.ts`, `src/ui/deep-dive/__tests__/deep-dive-screen.test.tsx`, `src/ui/deep-dive/deep-dive-persistence.test.ts` | ✅ Done `6e65834` | Full TDD | Fix: conversation runId held in `conversationRunIdRef` (`useRef<string \| null>(null)`), minted once via `conversationRunIdRef.current ??= crypto.randomUUID()` and reused by every `submitQuestion`; recovered after remount from `restored[0].runId` in the restore `useEffect`, so a post-navigation question resumes the SAME MA session. New per-turn `turnId = crypto.randomUUID()` now drives React keys (`key={turn.turnId}` on `<article>` + `<LiveTheater>`) and event routing (`recordEvent(turnId, …)` matches by `turn.turnId`). `PersistedTurn` gains a required `turnId: string` (kept `runId`); `isPersistedTurn` validates it. RED first (proven independently): "sends every follow-up question with the same conversation runId" (reads `runId` from both POST bodies via `fetchSpy.mock.calls`, asserts equal) and "resumes the same conversation runId after remount (durable MA session)" both FAILED on old code (distinct random runIds) while the 4 existing tests stayed green. Verified independently by architect: `tsc --noEmit` clean, eslint clean on all 4 files, full vitest 95 files / 497 tests green. 4 files, +110/-9. |

## Phase S — Design Studio bug-fix round (seller report, 2026-09-07)

> Context: after a manual UI test round of the Design Studio, the seller (product owner) filed 5 bugs. Execution is coordinated with Codex CLI over WSL under the same discipline as Phases P/E: TDD (RED first), explicit-path commits by the architect only, serialized hotspots, contracts stay frozen unless a scoped user-approved unlock is recorded here. Approved execution order: **S1 (#3) -> S2 (#2) -> S3 (#4) -> S4 (#1 + #5)**.

### The 5 reported bugs
1. Clicking a trend card that already has data still shows "Scanning Google Trends" first; opportunity score should be holistic across sources; `generate-design` took 76660ms (too slow). → S4.
2. Generated image shows only a markdown link, not a rendered image. → S2.
3. On reload, Design Studio gen-history vanishes; want a per-trend-card design-history block surviving reload, image URLs cached in browser storage as thumbnails. → S1.
4. The "analysis" section is redundant; split Design Studio into a draft-design-concept block + a seller prompt-input block. MA rules: seller enters NO prompt → Generate Design sends the draft concept to the MA to build the prompt + call the image tool; seller DOES enter a prompt → use their prompt. → S3.
5. After reload, clicking Generate Design triggers a ModelArk 400 (likely tool-call related); on reload Studio should show draft concept analysis, gen history, and the block layout. → S4.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **S1** | Studio gen-history persistence + per-card history block (#3) | `src/ui/studio/studio-persistence.ts` (NEW), `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/studio-persistence.test.ts` (NEW), `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done `d7b1047` | Full TDD | Client-side persistence, no frozen files. New `StudioHistoryStore` over injectable `sessionStorage` (per-card key `studio-designs:${cardId}` + `studio-runid:${cardId}`, SSR-safe in-memory fallback, malformed-JSON tolerant, de-dup by `designAssetUrl`). Screen restores history + runId AFTER mount in a client-only `useEffect` keyed on `card.id` (E9 SSR-safe pattern), records each `image:ready` URL, renders a "Previous designs" `<Panel aria-label="Design history">`. RED first. Verified by architect: tsc/eslint clean, full vitest 96 files / 502 tests green. 4 files, +285/-6. |
| **S2** | Render answer-embedded image URLs as `<img>`, not links (#2) | `src/ui/live-theater/answer-images.ts` (NEW), `src/ui/live-theater/answer-images.test.ts` (NEW), `src/ui/live-theater/live-theater.tsx`, `src/ui/live-theater/live-theater.test.tsx` | ✅ Done `1ab2b76` | Full TDD | Pure client render-time enhancement, no frozen files, reducer untouched. New pure `extractAnswerImageUrls(text)` scans for `https?://…` tokens, strips trailing punctuation, keeps only image-extension URLs (`.png/.jpg/.jpeg/.webp/.gif/.avif` + optional `?query`), de-dups first-seen. Screen computes `answerImageUrls = extract(answerText).filter(u => !imageUrls.includes(u))` (de-dup against `image:ready` images) and renders them as real `<img alt="Generated design">` after the answer `<p>`. RED first. Verified by architect: tsc/eslint clean, full vitest 97 files / 508 tests green. 4 files, +100. |
| **S3** | Draft-concept block + seller prompt block, threaded to the MA (#4) | `src/bff/types.ts` (frozen — authorized additive edit below), `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx`, `src/agent/__tests__/modelark-live-session.seller-prompt.s3.test.ts` (NEW) | ✅ Done `952bfb6` | Full TDD | Adds a visible "Draft design concept" block (shows `card.recommendation.action`) + a controlled "Your prompt" textarea. Wires `sellerPrompt` into the `generate-design` request ONLY when non-empty (trimmed); empty → request byte-identical to today. MA routing needs no new plumbing: the request object is a transparent pass-through (client `JSON.stringify(request)` in the query → `live-route.ts` `parseBody` casts it through → `modelark-live-session.ts send` forwards the whole request → `modelark-managed-agent-client.ts send` sends `JSON.stringify(request)` as the MA `user.message`). So the ONLY code change to a frozen file is the additive type field; a guard test proves the field is forwarded to `session.send` without editing the route/session files. |
| **S4a** | Fresh runId on generate after reload restore (bug #5 / 400) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done `331787f` | Full TDD | Client-only fix, NO frozen files. Root cause (FACT-traced): the mount `useEffect` restores the OLD persisted `runId` (`setRunId(restoredRunId)`); clicking Generate reused it; `sse-ui-event-source.ts` POSTs body `{ runId, reconnect:false }`; server `attachOrCreate(runId)` → `resolveRunSession.findByRunId` HIT the ended MA mapping → fresh `user.message` to a dead ModelArk session → 400. Fix: track `runIdIsFresh` (set false when restoring); new `startRun()` mints a fresh `crypto.randomUUID()` + persists it via `saveRunId` ONLY when the current id was restored, then `setStarted(true)`; button `onClick={startRun}`. In-session behavior byte-identical (fresh id → no re-mint). 3 new guard tests (parse POST body `runId`): fresh-after-restore, reuse-in-session, reload-layout. RED first (fresh-runId test failed `expected 'run-restored-123' not to be 'run-restored-123'`). Architect FACT-verified: tsc clean, eslint clean, `src/ui/studio` 2 files/12 tests, full suite 98 files/515 tests green; git audit confirms ONLY the 2 files changed and `run-session-coordinator.ts` / `live-route.ts` / all `src/agent/*` byte-unchanged. 2 files, +125/-1. |
| **S4b** | Suppress "Scanning" UI event on warehouse hit (bug #1, scope-reduced) | `src/agent/modelark-live-session.ts`, `src/agent/__tests__/modelark-live-session.warehouse-first.p9.test.ts` | ✅ Done `d7f4d4c` | Full TDD | AUTHORIZED UNLOCK (see note below). Client of #1 filed 3 sub-issues; architect diag (live, FACT) reduced scope to ONLY the scanning suppression. When a warehouse lookup HITS (`this.servedCard !== undefined`), the run must NOT emit the crawl `tool_call` RawMaEvent (which `sse-translator.ts` maps to `type:"scanning"` → "Scanning Google Trends" label). Crawl is already warehouse-served (no network) — only the misleading UI signal remains. Fix: in `modelark-live-session.ts`, after `submitCustomToolResult` for a warehouse-served crawl tool-use, skip pushing the mapped `tool_call` event (mint the tool result for the MA loop as today, but do not surface `scanning`). Score (#2, already holistic=84 from warehouse, no `card:ready` on this lane) and latency (#3, ~76s dominated by SeeDream 37.6s + MA reasoning, NOT re-crawl — crawl was 316ms) are OUT OF SCOPE per user (2026-09-07). |

### Frozen-file unlock (Phase S / S3 scope only)

> AUTHORIZED UNLOCK (user-approved 2026-09-07, "Ok hãy theo phương án A" = Option A): to land S3, `src/bff/types.ts` is temporarily unlocked ONLY for a single ADDITIVE, backward-compatible change: add an OPTIONAL `sellerPrompt?: string` field to the `generate-design` member of the `BffRequest` union. No other member, type, or interface changes; no validation/stripping added. `packages/contracts/*`, `src/integration/live-route.ts`, `src/agent/modelark-live-session.ts`, `src/agent/modelark-managed-agent-client.ts`, all `.env*`, and migrations stay FROZEN — the pass-through path carries the new field with no edits. Re-freeze `src/bff/types.ts` after the S3 merge. **RE-FROZEN post-merge (commit 952bfb6, 2026-09-07): the additive change landed; `src/bff/types.ts` is FROZEN again.** Architect FACT-verified: tsc clean, eslint clean, full suite 98 files / 512 tests green; git audit confirms ONLY the 4 authorized files changed and live-route.ts / modelark-live-session.ts / modelark-managed-agent-client.ts / packages/contracts are byte-unchanged.

> Rationale for Option A over a UI-only stub: the seller's own prompt must actually reach the Managed Agent to affect generation. Because the request path is a verified end-to-end pass-through, the minimal correct fix is the optional type field (so TypeScript accepts it) + UI wiring — the smallest possible frozen-file blast radius.

### Frozen-file unlock (Phase S / S4b scope only)

> AUTHORIZED UNLOCK (user-approved 2026-09-07, corrected-Option-A after architect live diag): to land S4b, `src/agent/modelark-live-session.ts` is temporarily unlocked ONLY to suppress the crawl `tool_call` UI event when the run is warehouse-served (`this.servedCard !== undefined`). NO change to the MA agent loop, image generation, tool-result submission, metrics, crawl fallback, or scoring. `src/bff/sse-translator.ts`, `ma-event-mapper.ts`, `packages/contracts/*`, `src/integration/*`, and all other `src/agent/*` stay FROZEN. Scope reduced by user to scanning-only: score (#2) and latency (#3) explicitly dropped. Re-freeze `src/agent/modelark-live-session.ts` after the S4b merge. **RE-FROZEN post-merge (commit d7f4d4c, 2026-09-07): the scanning-suppression guard landed; `src/agent/modelark-live-session.ts` is FROZEN again.** Architect FACT-verified: RED reproduced (warehouse-hit test failed `expected true to be false`, both controls passed), then GREEN; p9 file 9/9, `src/agent` 25 files/106 tests, tsc clean, eslint src/agent clean, full suite 98 files/518 tests (+3 vs 515 baseline, same file count). Git audit: ONLY the 2 authorized files changed (+56/-6); `ma-event-mapper.ts`, `sse-translator.ts`, `live-route.ts`, `run-session-coordinator.ts`, `modelark-managed-agent-client.ts`, `packages/contracts/*`, and all `src/ui/*` byte-unchanged.

> Diag FACT (generate-design, seed "retro halloween cats", warehouse HIT score=84): lookup 105ms; crawl tool warehouse-served in 316ms (NO network re-crawl); SeeDream image 37.6s; total 76.4s. SSE frames included `scanning source=google_trends`. Confirms bug #1 latency is image-generation-bound, not crawl-bound; only the scanning label is a real defect fixable here.

## Phase S — Design Studio bug-fix round 2 (seller report, 2026-09-07)

> Context: after S1–S4b landed, a second manual UI test of the Design Studio produced 6 more reports. The architect diagnosed ALL SIX live against the running app (FACT, not code-reading alone) before writing this. Two of the original premises were OVERTURNED by the FACT diagnosis (see "Diagnosis FACT" below). Same discipline as every prior phase: TDD (RED first), explicit-path commits by the architect only, serialized hotspots (every task below touches `src/ui/studio/design-studio-screen.tsx` → run them ONE session at a time, never parallel), contracts stay FROZEN unless a scoped user-approved unlock is recorded here. One Codex session per task/feature.

### The 6 reported bugs (round 2) — as filed

1. "Still crawling": backend still hits `POST /api/live?request=...%22mode%22%3A%22live%22...` 200 in 9003ms / 235223ms.
2. The current "Draft design concept" block only shows creative direction (one line).
3. Want a screen block that shows the FULL draft-design TEXT (the markdown report/brief the agent produced), with a Generate Design button below it.
4. The run stops at "Synthesizing signals" — no image generation, no design image displayed.
5. Want a block so that clicking Generate Design shows a loading bar aliased "Đang tạo ảnh thiết kế ..." then, when the Seedream result arrives, downloads it and displays the image directly in the result block.
6. F5/reload returns to the initial Generate-design screen instead of the checkpoint per action history; if not restorable, show a task-history list on the side that reopens a task to view progress/result.

### User decisions (binding scope, 2026-09-07, Vietnamese, verbatim)

> "1. Bug 1 - ok, chỉ add 'served from warehouse' badge, còn phần latency thì tạm để vậy, tuy nhiên cần xử lý để hiển thị được ảnh kết quả như ở bug 4."
> "2. Bug 6 - chọn prefer resume-to-checkpoint (reopen the in-flight/last run automatically) and the side task-history list"

Interpretation locked in:
- **#1** → only a "served from warehouse" badge; latency EXPLICITLY out of scope; result-image display is handled by the same fix as #4/#5 (S6).
- **#6** → BOTH resume-to-checkpoint (auto-reopen the in-flight / last run) AND a side task-history list that reopens a task (S8).

### Diagnosis FACT (live run, generate-design, seed "retro halloween cats", warehouse HIT score=84)

- **#1 premise OVERTURNED:** LOOKUP kind=hit score=84 in ~78ms; NO live Apify crawl runs. The `mode:"live"` in the client request URL is a STRIPPED param (`modelark-live-session.ts send()` discards `_mode`; delivery is decided by the warehouse lookup). The 9s/235s is MA reasoning + Seedream image time, NOT crawling. → badge only + fix image display.
- **#4 premise OVERTURNED:** full SSE captured = `synthesizing ×4 → image:ready (REAL signed TOS url) → synthesizing ×2 → answer → done` (~68.7s). The backend DOES generate the image + text and DOES complete. The two real UI defects are: (a) the status label REGRESSES to "Synthesizing signals" after image:ready because the TRAILING synthesizing frames reset the reducer stage (`creator-view-state.ts` `synthesizing` case sets `stage:"synthesizing"` unconditionally); (b) the raw signed TOS URL likely fails to render in-browser (short-lived / CORS), so `<img src={rawTosUrl}>` shows nothing.
- **#2/#3 confirmed by code:** the "Draft design concept" panel renders ONLY `card.recommendation.action`; the full `answer` text has no dedicated block and there is no Generate button beneath a full brief.
- **#6 root cause:** the mount `useEffect` in `design-studio-screen.tsx` restores `designHistory` + `runId` (sets `runIdIsFresh=false`) but NEVER sets `started=true` → reload always renders the "Generate your first draft" panel. There is no run-status / task model in `studio-persistence.ts` (only `{runId, designAssetUrl, createdAt}`), so neither checkpoint-resume nor a task list is possible yet.

### Frozen-file scope for round 2

- `src/ui/studio/*` is NOT on the Phase P frozen list (line ~162 freezes `src/ui/live-theater/*`, not `src/ui/studio/*`). So S5, S6, S8, S9 touch only NON-frozen studio files + a NEW additive backend route → NO unlock needed for them.
- ONLY S7 (status-label regression) touches FROZEN `src/ui/live-theater/*` → requires the scoped unlock recorded below.
- The new backend image-proxy route `app/api/design-image/route.ts` is a NEW file (additive), not frozen. `packages/contracts/*`, `src/bff/types.ts`, `src/bff/sse-translator.ts`, `ma-event-mapper.ts`, `src/integration/*`, `src/agent/*`, all `.env*`, and migrations stay FROZEN.

### Approved execution order: S5 (#2,#3) -> S6 (#4-img,#5,#1-img) -> S7 (#4-label) -> S8 (#6) -> S9 (#1-badge) -> S10 (remove Generate btn in concept panel) -> S11 (run-completion persistence + reload routing)

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **S5** | Full draft-design TEXT block + Generate Design button beneath it (#2, #3) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done `2516b54` | Full TDD | Render a dedicated block that shows the FULL draft-design brief text (the agent's `answer` markdown), not just `card.recommendation.action`. Place the Generate Design button directly beneath that brief block. Client-only; no frozen files. Design question for the RED brief: the "full brief" text is the MA `answer` — decide whether it is the pre-generation concept (shown before Generate) vs. the streamed answer (shown during/after the run); FACT shows `answer` arrives late in the SSE stream, so the pre-generation brief must come from `card` fields already on screen (holistic concept), while the streamed `answer` feeds the result block. Keep `card.recommendation.action` visible; ADD the fuller text block. RED first (assert the full brief text + a Generate button render). |
| **S6** | Generation loading bar ("Đang tạo ảnh thiết kế ...") + server-side proxy-download so the Seedream image actually displays (#5, #4-image, #1-image) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx`, `app/api/design-image/route.ts` (NEW), `app/api/design-image/__tests__/route.test.ts` (NEW) | ✅ Done `a941004` | Full TDD | Two parts. (A) UI: after Generate Design is clicked and while the run is between `synthesizing` and `image:ready`, show a loading bar labelled exactly "Đang tạo ảnh thiết kế ..." in the result block; when `image:ready` arrives, show the image. (B) Backend proxy: NEW additive route `GET /api/design-image?src=<encoded TOS url>` that fetches the signed TOS bytes SERVER-SIDE and streams them to the browser (fixes the raw signed-URL / CORS / expiry failure). SSRF guard: validate the `src` host against the Seedream TOS host allowlist (`*.tos-ap-southeast-1.volces.com` / the exact host used by `modelark-seedream-image-port.ts`) and reject anything else. Client rewrites the `image:ready` url to `/api/design-image?src=<encoded>` before rendering `<img>`. No contract change (client-side URL rewrite + additive route). RED first for BOTH the route (allow valid host, reject other host, stream bytes) and the loading-bar UI. |
| **S7** | Status label must not regress to "Synthesizing signals" after image:ready (#4-label) | `src/ui/live-theater/creator-view-state.ts`, `src/ui/live-theater/live-theater.tsx`, `src/ui/live-theater/live-theater.test.tsx` | ✅ Done `bd211fd` | Full TDD | AUTHORIZED UNLOCK (see block below). Fix the reducer so a `synthesizing` frame that arrives AFTER `image:ready` does NOT reset the stage back to "synthesizing" (e.g. once stage has reached "image-ready", a later synthesizing frame keeps the terminal/image-ready label, or the label is derived from the max stage reached). NO change to the UiEvent contract, the SSE translator, or the event ordering — this is a pure client reducer/label fix. RED first: feed `synthesizing → image:ready → synthesizing` and assert the header does NOT read "Synthesizing signals" after the image. |
| **S8** | Resume-to-checkpoint (auto-reopen in-flight/last run) + side task-history list (#6) | `src/ui/studio/studio-persistence.ts`, `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/studio-persistence.test.ts`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done `10ca4bb` | Full TDD | Client-only; no frozen files. (A) Persistence model: extend the store with a run-status / task record (e.g. `{runId, status: 'in-flight'|'done'|'error', startedAt, ...}`) so a run's lifecycle survives reload. (B) Resume: on mount, if a last/in-flight run exists, set `started=true` and reopen it (auto-reconnect via the existing `sse-ui-event-source` `reconnect` path for in-flight; replay/show result for done) INSTEAD of dropping to the "Generate your first draft" panel. Reconcile with S4a: S4a mints a FRESH runId on Generate-after-restore to avoid the dead-session 400 — resume must reopen an IN-FLIGHT run WITHOUT minting a new id (only mint fresh when the seller explicitly starts a NEW generation), so the S4a rule narrows to "fresh id on explicit new Generate", not "fresh id on every restore". (C) Side task-history list: a panel listing prior/known runs for the card; clicking one reopens it to view progress/result. RED first for the new store fields AND the mount-restore-sets-started behavior AND the task-list render+click. |
| **S9** | "Served from warehouse" badge (#1) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done 66f586a | Full TDD | **OPTION A chosen by user (2026-09-07).** ARCHITECT FACT-ESCALATION: the "no `scanning` frame" inference is NOT observable in the scoped file — `LiveTheater` (FROZEN) consumes all `scanning` frames inside `creator-view-state.ts` (FROZEN) and exposes ONLY `onImageReady`; `DesignStudioScreen` cannot see scanning at all. Using that signal would force unfreezing `packages/contracts/ui-event.ts` / `live-theater.tsx` — REJECTED. FACT: `app/studio/[id]/page.tsx` ALWAYS loads the card via `buildWarehouseReader().findById(id)`, so the studio card is ALWAYS warehouse-served; the card already carries `freshnessTier` ("hot"/"warm"/"cold") + `updatedAt` in props (non-frozen). DECISION: badge is derived CLIENT-ONLY from card provenance — render a small "Served from warehouse" badge in the Draft-design-concept panel (near the concept text / Product-Market dl), optionally annotated with `freshnessTier`/`updatedAt`. NO frozen file, NO contract change, NO SSE/scanning dependency. RED first: badge with text matching /served from warehouse/i renders for a warehouse card; assert it lives inside the Draft-design-concept panel. |
| **S10** | Remove "Generate design" button from the Draft-design-concept panel (UX cleanup, user request 2026-09-07) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done 66f586a | Full TDD | Client-only; no frozen files. Remove the `<button aria-label="Generate design from concept">` in the Draft-design-concept `Panel` (currently ~lines 257-264). KEEP the empty-state "Generate design" button inside the "Generate your first draft" block (~lines 344-350) — that stays the run entry point. Same hotspot as S9 (`design-studio-screen.tsx`) → SAME single Codex session, serialized after S9 GREEN, never parallel. RED first: assert `queryByLabelText("Generate design from concept")` is null AND the empty-state Generate button still renders + still starts a run (existing empty-state tests stay GREEN unchanged). |
| **S11** | Fix studio run-completion persistence + reload routing (seller bug 2026-09-07) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done bbb2646 | Full TDD | **HUONG A chosen by user (2026-09-07).** ROOT CAUSE (architect FACT): a completed run is recorded ONLY via `recordDesign`, called ONLY by `LiveTheater` `onImageReady`, which fires ONLY on an `image:ready` UiEvent. When the warehouse-served design image arrives EMBEDDED in the `answer` message text (raw markdown, extracted client-side by frozen `extractAnswerImageUrls`) there is NO `image:ready`, so `recordDesign` never runs -> run stays `in-flight` in `studio-runs:` -> on reload `runToResume` picks the in-flight run, re-streams (status stays "In-Flight", the "Đang tạo ảnh thiết kế ..." loading bar persists) AND the design is never appended to Previous designs. Also `streaming` is never set false on stream end (no `done` handling). CONSTRAINT: `LiveTheater`/`creator-view-state.ts` are FROZEN and expose ONLY `onImageReady` (no done/answer-image signal) -> NOT unfrozen. DECISION (client-only, no frozen file, no contract change): (A) in `design-studio-screen.tsx` wrap the `UiEventSource` in a tee-adapter generator that forwards every event to a Studio observer then yields it onward to `LiveTheater` unchanged (single-consumption preserved). The observer: on the first design image (from an `image:ready` URL OR from `extractAnswerImageUrls(answer.text)` — import the frozen helper, do NOT edit it) calls `recordDesign` (persists design + upserts run `done`); on a terminal `done` or non-recoverable `error` sets `streaming=false` and, if no image was seen, upserts the run to `done`/`error` so it is NOT stuck `in-flight`. (B) Reload routing change: the mount effect must resume ONLY an in-flight run — drop the `?? mostRecentRun(all)` fallback so a store whose newest run is `done` FALLS THROUGH to the fresh "Generate your first draft" screen (fresh runId via the S4a mint path); the done run stays visible/clickable in the `Task history` panel (S8). AUTHORIZED: rewrite EXACTLY ONE S8 test — `"resumes a completed run and shows its result without re-fetching"` — to assert that on reload a done-only store shows the fresh Generate screen (NOT the auto-reopened result) while Task history still lists+reopens it. Keep every OTHER test unchanged, especially `"auto-resumes an in-flight run on mount without minting a new runId"` and `"renders a task-history list and reopens a run on click"`. RED first: (1) an answer-image-only run records the design + flips run to done + stops the loading bar (no `image:ready`); (2) on reload a done-only store renders "Generate your first draft" and mints a fresh runId, not the old result. Same hotspot as S9/S10 (`design-studio-screen.tsx`) — SAME single Codex session, serialized, never parallel. |

### Frozen-file unlock (Phase S round 2 / S7 scope only)

> AUTHORIZED UNLOCK (user-approved 2026-09-07): to land S7, `src/ui/live-theater/creator-view-state.ts` and `src/ui/live-theater/live-theater.tsx` (both under the FROZEN `src/ui/live-theater/*` set) are temporarily unlocked ONLY to stop the status label regressing to "Synthesizing signals" when a `synthesizing` frame arrives after `image:ready`. NO change to the `UiEvent` contract, `packages/contracts/*`, `src/bff/sse-translator.ts`, `src/bff/ma-event-mapper.ts`, `src/agent/*`, event ordering, or the S2 answer-image rendering. Re-freeze both files after the S7 merge. (Status will be stamped RE-FROZEN + commit + FACT verification once merged.)


> **S5 DONE `2516b54` (2026-09-07).** The "full draft-design brief text" = `card.recommendation.reasoning` (already on the `TrendCard` contract, present at render time — NOT the late-arriving SSE `answer`). Rendered inside the existing `aria-label="Draft design concept"` panel beneath `card.recommendation.action`, with a second Generate button (`aria-label="Generate design from concept"`, distinct accessible name so the exact-name `getByRole("button", { name: "Generate design" })` lookups stay single-match) wired to the existing `startRun`. Client-only; NO frozen files touched. RED first (2 failing: reasoning text absent / concept button absent), then GREEN. Architect FACT-verified independently: `tsc --noEmit` clean, `eslint src/ui/studio` clean, `src/ui/studio` 2 files/15 tests, FULL suite 98 files/521 tests (+3 vs 518, same file count); `git --no-pager diff` audit confirms ONLY the 2 scoped files changed (+55) and `packages/contracts/*`, `src/ui/live-theater/*`, `src/ui/studio/studio-persistence.ts`, `app/**` byte-unchanged.


> **S6 DONE `a941004` (2026-09-07).** Two-part fix, strict TDD, NO frozen file touched. (A) Studio right panel now renders an `aria-label="Design result"` block: while `started && designAssetUrl===undefined` it shows a `role="status"` loading bar with the EXACT label `Đang tạo ảnh thiết kế ...`; once `recordDesign` sets `designAssetUrl` (from the `image:ready` UiEvent `{id,type:"image:ready",url}` via the existing `onImageReady`), it renders `<img alt="Generated design" src={/api/design-image?src=encodeURIComponent(url)}>`. The FROZEN `LiveTheater` is untouched (still shows the raw stream); the working display lives in the non-frozen studio panel. (B) NEW additive proxy: thin `app/api/design-image/route.ts` (GET, delegate pattern like publish/live) -> `src/integration/design-image-route.ts` `createDesignImageGetHandler({fetch})` + `buildDesignImageDependencies()`. SSRF guard: only hostnames ending `.tos-ap-southeast-1.volces.com` (the confirmed Seedream host `ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com`) pass; missing/other-host/non-http(s) -> 400 (fetch NOT called), `redirect:"manual"` blocks redirect-bypass; upstream non-OK -> 502; success streams `upstream.body` with copied content-type (default image/png) + `cache-control: private, max-age=60`. NOTE: route logic+test live in `src/integration/` (repo delegate convention), NOT `app/api/design-image/__tests__/` as the row originally listed. Architect FACT-verified INDEPENDENTLY: `tsc --noEmit` clean, `eslint src/ui/studio src/integration app/api/design-image` clean, FULL suite 99 files/527 tests (+1 file/+6 vs 98/521); `git status --porcelain` = exactly the 5 S6 paths, frozen-path grep EMPTY (`packages/contracts/*`, `src/ui/live-theater/*`, `studio-persistence.ts`, `live-route.ts`, `live-dependencies.ts`, `next.config.ts`, `app/api/live/*`, `app/api/publish/*` all byte-unchanged). Committed 5 files (+241) by the architect with explicit paths.


> **S7 DONE `bd211fd` (2026-09-07).** Reducer-only fix, strict TDD, NO frozen file touched. Root cause: `creator-view-state.ts` `case "synthesizing"` set `stage: "synthesizing"` UNCONDITIONALLY, so a TRAILING synthesizing frame (the real SSE is `synthesizing x4 -> image:ready -> synthesizing x2 -> answer -> done`) pulled the stage — and the `live-theater.tsx` header label — back from "Image ready" to "Synthesizing signals". Fix (+5-1): the `stage` assignment in the synthesizing case is now conditional — if `state.stage` is already `"image-ready"` or `"card-ready"` it KEEPS that stage, else `"synthesizing"`; `streamStatus`, `synthesisNote`, `seenEventIds` unchanged. `live-theater.tsx` was NOT modified (label is already derived from `state.stage`; reducer fix is sufficient). Added 1 regression test in `live-theater.test.tsx` (+36): `keeps the Image ready label when a synthesizing frame arrives after image:ready` — emits synthesizing -> image:ready -> trailing synthesizing, asserts header stays "Image ready" and "Synthesizing signals" is absent. RED confirmed first ("Unable to find an element with the text: Image ready", rendered header was "Synthesizing signals"). Architect FACT-verified INDEPENDENTLY: `git diff` = exactly the 2 scoped files (`creator-view-state.ts` +5-1, `live-theater.test.tsx` +36), `live-theater.tsx` byte-unchanged, all frozen paths (`packages/contracts/*`, `src/bff/*`, `src/ui/studio/*`, `app/**`) unchanged; `tsc --noEmit` clean; `eslint src/ui/live-theater` clean; FULL suite 99 files / 528 tests (+1 test vs 99/527, same file count). Committed 2 files (+40-1) by the architect with explicit paths. RE-FROZEN: per the S7 unlock block, `creator-view-state.ts` and `live-theater.tsx` are now re-frozen after this merge.


> **S8 DONE `10ca4bb` (2026-09-07).** Client-only, strict TDD, NO frozen file touched. (A) `studio-persistence.ts` gains `StudioRunStatus`/`PersistedRun` and OPTIONAL `loadRuns`/`saveRun` on a NEW key `studio-runs:${cardId}` — `saveRun` UPSERTS by runId (in-flight->done keeps ONE record in place, order preserved), `loadRuns` validates each record shape and returns [] for unknown/corrupt. (B) `design-studio-screen.tsx` splits a new `streaming` state from `started` (SSE `useMemo` + `<LiveTheater>` now gate on `streaming`, studio result panel/publish gate on `started`). Mount auto-resume is FEATURE-DETECTED (`typeof historyStore.loadRuns === 'function'`): legacy stores keep BYTE-IDENTICAL behavior (started=false, no mount fetch). When present, it picks the newest in-flight run (reopens LIVE, reusing its runId, no mint) else newest run overall (done/error: restores designAssetUrl, shows proxied `/api/design-image?src=` image, `streaming=false` so NO re-fetch — avoids the S4a dead-session 400). `startRun()` still mints a fresh id ONLY on explicit Generate-after-restore (S4a rule NARROWED to explicit Generate) and now records an `in-flight` run; `recordDesign` upserts the run to `done`. (C) NEW `aria-label="Task history"` panel lists runs (newest first) as buttons; click reopens via the same no-mint decision (done shows result w/o fetch, in-flight reopens live). Added a `beforeEach(sessionStorage.clear())` (additive) because the DEFAULT store now implements `loadRuns` over real sessionStorage — prevents run leakage between tests; NO existing test body edited. Architect FACT-verified INDEPENDENTLY: diff = exactly the 4 scoped files (`studio-persistence.ts` +62, `design-studio-screen.tsx` +126-10, +2 test files +202), frozen-path audit EMPTY (`src/ui/live-theater/*` incl. `sse-ui-event-source.ts`/`live-theater.tsx`/`creator-view-state.ts`, `src/integration/*`, `src/bff/*`, `packages/contracts/*`, `app/**`, `next.config.ts` all byte-unchanged); `tsc --noEmit` clean; `eslint src/ui/studio` clean; FULL suite 99 files / 536 tests (+8 vs 99/528, same file count); all S4a tests (`mints a fresh runId when generating after a reload restore`, `reuses the in-session runId when nothing was restored`, `on reload, shows draft concept...`, `restores previously generated designs...`) PASS unchanged. Committed 4 files (+380-10) by the architect with explicit paths.


---

## Phase S round 3 — Author-flow productization (S12–S14)

**Context (user product report, 2026-09-09).** Three defects in the Discover "Author trend card" flow:
1. Clicking **Author trend card** jumps straight to a generated **design image**; it must instead produce the detailed **Trend Card dashboard** (FR12 `TrendCardDetail`, the seller-insight dashboard + opportunity report). Only *then* does clicking **Open Design Studio** create a design.
2. Discover has **no task history**. One click of "Author trend card" = one task with a status (`in-progress`/`done`/`failed`); on reload an in-progress task must resume/show, a completed task must link to its dashboard.
3. Authoring shows only a Google-Trends signal, **not a multi-source opportunity score** aggregated per the G1 rules (Amazon+Etsy demand, Meta-ad proven-intent, TikTok/Reddit/Pinterest/Google-Trends early-culture, competition-inverse).

**Architect FACT (this repo, verified 2026-09-09).**
- `seed-authoring-panel.tsx` (NON-frozen `src/ui/discover/*`) submits the trend-card request and then renders `<LiveTheater eventSource={…} />` INLINE. `LiveTheater` (FROZEN `src/ui/live-theater/*`) surfaces any `image:ready` design image and exposes ONLY `onImageReady` — it never routes anywhere. This is the root of defect #1 and #4 (cat design): the design is shown at author time instead of the dashboard.
- The trend-card lane DOES emit `card:ready` carrying the full `TrendCard` (with `id`). Warehouse HIT → `card:ready`+`done` immediately (`live-route.ts resultResponse`). MISS → `createPersistingTrendCardSessionPort` SAVES the card BEFORE yielding `final_card`→`card:ready`, so `/trends/[card.id]` (`app/trends/[id]/page.tsx` → `buildWarehouseReader().findById(id)`) resolves race-free.
- Design-image generation during authoring is MA/agent-platform-driven (`modelark-live-session.ts` fulfils any `generate_design_image` tool-call the LLM makes) — NOT controllable from this repo's client. Therefore the client fix is: route to the dashboard the instant the card is ready and STOP surfacing the design image in the author flow.
- Proven client-only observe pattern exists: `observeUiEventSource(source, observer)` (a tee generator that forwards each event to an observer then yields it onward) — used in `design-studio-screen.tsx` for S11. This lets the author panel observe `card:ready` WITHOUT touching frozen `LiveTheater`.

**Execution order (architect decision):** S12 → S13 → S14. S14 is blocked by S12+S13.

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **S12** | Author → Trend Card dashboard routing (defect #1, #4) | `src/ui/discover/seed-authoring-panel.tsx`, `src/ui/discover/__tests__/seed-authoring-panel.test.tsx` | ✅ Done 0409764 | Full TDD | Client-only; NO frozen file. On `card:ready` the author flow must navigate the seller to `/trends/${card.id}` (the FR12 `TrendCardDetail` dashboard) instead of rendering the design inline, and must NOT surface any generated design image at author time (design generation lives entirely behind the dashboard's "Open Design Studio" link). Works for BOTH warehouse HIT (immediate `card:ready`) and live MISS (card is persisted before `card:ready`, so the route resolves). Implementation: consume the SSE `UiEventSource` in the panel (or via the `observeUiEventSource` tee pattern) to detect the `card:ready` event, then `useRouter().push("/trends/"+card.id)`; while the run is in progress show a minimal "Creating your Trend Card…" progress state that does NOT display the design image; DROP the inline `<LiveTheater>` image surface from this flow. MUST NOT edit `src/ui/live-theater/*`, `packages/contracts/*`, `src/bff/*`, or the SSE wire-shape — importing the frozen pure helpers read-only (e.g. `createSseUiEventSource`) is allowed; editing them is not. RED first: (1) a run whose stream yields `card:ready` with a card `id` calls `router.push("/trends/<id>")` (mock `next/navigation`); (2) a stream that yields `image:ready` during authoring renders NO design `<img>` (no "Generated preview"/"Generated design" image). Keep the existing 2 tests GREEN unchanged — mount does not fetch + submit still POSTs the byte-identical `{kind:"trend-card", crawl:{source:"google_trends",…,mode:"live"}}` request. |
| **S13** | Discover Task History + resume-on-reload (defect #2) | `src/ui/discover/*` + NEW discover-persistence module + tests | ✅ Done cd6fae9 | Full TDD | Each "Author trend card" click = one task `{id, seed, market, productType, status: in-progress\|done\|failed, startedAt, cardId?}`. Persist via injectable `sessionStorage` mirroring `studio-persistence.ts`. Add a Task-history block to the Discover screen. On reload: in-progress → resume/show; done → link to `/trends/${cardId}`; failed → error state. Client-only; no frozen files. Full RED-first TDD. Scope + exact RED cases to be authored after S12 GREEN. |
| **S14** | Multi-source opportunity score in the author flow (G1, defect #3) | `src/integration/rescoring-live-session-port.ts` (NEW) + `src/integration/live-dependencies.ts` + tests | ✅ DONE (commit c2d12ec; 101 files/555 tests green; src/integration re-frozen — see S14 DONE block) | Full TDD | The author request currently hardcodes `source:"google_trends"`. FR/G1 requires the score to aggregate ALL sources (Amazon+Etsy demand 0.35 · Meta-ad proven-intent 0.30 · TikTok+Reddit+Pinterest+Google-Trends early-culture 0.25 · competition-inverse 0.10). `APIFY_TOKEN` is real. FIRST re-diagnose by FACT WHY only google_trends is scanned (the MA agent selects crawl tools; the client `crawl.source` is a STRIPPED param per `modelark-live-session.send()`), THEN scope. MAY touch frozen files (router/contracts/session) → requires a scoped, user-approved unlock recorded in this file BEFORE any frozen edit. Scope + RED cases authored after S13 GREEN.


> **S12 DONE `0409764` (2026-09-09).** Client-only, strict TDD, NO frozen file touched. Root cause: `seed-authoring-panel.tsx` rendered `<LiveTheater>` INLINE after submit, surfacing the agent-generated design image at author time and never routing to the FR12 dashboard (defects #1 + #4). Fix (+39-6 impl): the panel now (A) consumes the SSE `UiEventSource` in a guarded `useEffect` (cancelled-flag cleanup, acts on the FIRST `card:ready` only) and calls `useRouter().push("/trends/" + event.card.id)`; (B) REMOVED the `<LiveTheater>` import + inline render, replacing it with a minimal `role="status"` "Creating your Trend Card…" indicator that renders NO `<img>`. Works for BOTH warehouse HIT (immediate `card:ready`) and live MISS (card persisted before `card:ready` by `createPersistingTrendCardSessionPort`, so `/trends/[id]` resolves). The submit request object, `/api/live` POST, `?request=` query encoding, and `maxReconnects:1` are byte-unchanged. RED first (2 new tests failed before impl): "routes to the dashboard on card:ready" (mocks `next/navigation` via `vi.hoisted` pushSpy, asserts `push("/trends/card-xyz")`) and "does not render a design image during authoring" (feeds `image:ready`, asserts `queryByAltText(/generated (preview|design)/i)` is null). Architect FACT-verified INDEPENDENTLY: `git diff` = exactly the 2 scoped files (`seed-authoring-panel.tsx` +39-6, test +92-6), frozen-path audit EMPTY (`src/ui/live-theater/*`, `packages/contracts/*`, `src/bff/*`, `src/agent/*`, `src/integration/*`, `app/**`, `.env*` all byte-unchanged); `tsc --noEmit` clean; `eslint src/ui/discover` clean; `src/ui/discover` 4/4 pass; FULL suite 99 files / 541 tests. Committed 2 files by the architect with explicit paths. NOTE: design generation still happens agent-side during the trend-card run (platform-driven, not repo-controllable) but is no longer shown to the seller — the seller now lands on the dashboard and only creates a design via "Open Design Studio". S14 will address the single-source scan so the dashboard shows a full multi-source opportunity score.


---

## S13 — Discover Task History + resume-on-reload (defect #2) — SCOPE LOCKED (architect, 2026-09-09)

**Architect FACT diagnosis (this repo, verified 2026-09-09).**
- `seed-authoring-panel.tsx` (NON-frozen) creates a per-click SSE run (`crypto.randomUUID()` runId, `createSseUiEventSource → /api/live`, `maxReconnects:1`) and, since S12, consumes the stream to `router.push("/trends/"+card.id)` on the FIRST `card:ready`. There is NO persistence: reload loses the run, and there is NO list of past author actions.
- The proven persistence pattern to MIRROR is `src/ui/studio/studio-persistence.ts`: `createSessionStorageStudioStore(storage?: StoragePort)` with an injectable `Pick<Storage,"getItem"|"setItem">`, a `createMemoryStorage()` fallback, `resolveStorage()` (sessionStorage → memory), namespaced keys, corrupt-JSON → `[]`, and upsert-by-id (`saveRun` finds by `runId`). `design-studio-screen.tsx` injects `historyStore = createSessionStorageStudioStore()` via a defaulted prop and, on mount, `historyStore.loadRuns(card.id)` to restore + render a task-history block.
- CRITICAL DIFFERENCE from studio: Discover has NO `card.id` at author time (the card does not exist yet). Therefore the discover store is a SINGLE GLOBAL task list under one key (`discover-tasks`), NOT keyed per-card. Each task carries its own `runId` so an in-progress task can be RECONNECTED on reload (same runId + rebuilt request) and still route when `card:ready` arrives.

**Scope — ONLY these files (client-only; NO frozen path):**
- NEW `src/ui/discover/discover-persistence.ts` (+ NEW `src/ui/discover/__tests__/discover-persistence.test.ts`)
- `src/ui/discover/seed-authoring-panel.tsx` (+ its `__tests__/seed-authoring-panel.test.tsx`)
- MUST NOT edit `src/ui/live-theater/*`, `packages/contracts/*`, `src/bff/*`, `src/agent/*`, `src/integration/*`, `app/**`, any `.env*`. Read-only frozen imports (`createSseUiEventSource`, `UiEventSource`/`UiEvent` types) allowed.

**Data model (new module).**
- `type DiscoverTaskStatus = "in-progress" | "done" | "failed"`
- `type DiscoverTask = { id: string; runId: string; seed: string; market: string; productType: string; status: DiscoverTaskStatus; startedAt: string; cardId?: string }` (id === runId in practice; cardId set only when done)
- `interface DiscoverTaskStore { load(): DiscoverTask[]; save(task: DiscoverTask): void }` — `save` upserts by `id`.
- `createSessionStorageDiscoverStore(storage?: StoragePort): DiscoverTaskStore` — mirror studio-persistence exactly: injectable StoragePort, memory fallback, key `discover-tasks`, corrupt-JSON → `[]`, best-effort writes in try/catch.

**Panel wiring (`seed-authoring-panel.tsx`).**
- Accept optional prop `taskStore?: DiscoverTaskStore` defaulting to `createSessionStorageDiscoverStore()`. Keep `useRouter`.
- On submit: build runId, save task `{id:runId, runId, seed:trimmedTopic, market, productType, status:"in-progress", startedAt: new Date().toISOString()}` and update local `tasks` state BEFORE/at run start. Request object, `/api/live` POST, `?request=` encoding, `maxReconnects:1` STAY byte-identical to S12.
- On first `card:ready` (existing guarded useEffect): upsert task → `{status:"done", cardId: event.card.id}`, persist, refresh local state, THEN `router.push("/trends/"+event.card.id)` (unchanged nav).
- On mount: `taskStore.load()` → render a Task-history block listing tasks (most-recent first). done → an `<a href={"/trends/"+cardId}>` link showing seed/market; in-progress → a `role="status"` "Creating your Trend Card…" row (NO `<img>`); failed → an error row. For each in-progress task on mount, RECONNECT: `createSseUiEventSource` with the stored `runId` + a request rebuilt from the task's seed/market/productType (same shape), so a late `card:ready` still updates the task to done + routes. (Reuse the same consume/guard logic; a cancelled-flag cleanup per source.)
- Keep the in-progress inline indicator behaviour from S12; the history block is additive. No `<img>` anywhere in this flow.

**RED cases (must fail first).**
persistence module (mirror studio tests):
1. empty list for a fresh store → `load()` === `[]`.
2. round-trips a saved task → `save(TASK); load()` deep-equals `[TASK]`.
3. upserts by id (in-progress → done keeps ONE record with cardId) → length 1, equals the completed task.
4. corrupt JSON → `load()` === `[]`.
panel:
5. on submit, an in-progress task is persisted → injected store's `load()` has 1 task with the entered seed/market/productType and `status:"in-progress"` (assert via injected store).
6. on `card:ready`, the task flips to done with cardId AND a link to `/trends/<cardId>` is rendered (and `pushSpy` still called — keep S12 nav).
7. on mount with a pre-seeded DONE task in the injected store, the history block renders an `<a>` to `/trends/<cardId>` WITHOUT fetching (fetchSpy not called on mount).
8. on mount with a pre-seeded IN-PROGRESS task, the panel reconnects — `fetchSpy` is called with the stored runId in the `/api/live` URL — and when its SSE yields `card:ready`, the task flips to done + routes.
- KEEP the 4 existing tests GREEN unchanged in intent (no-fetch-on-mount with empty store, submit request byte-shape, S12 routes-on-card:ready, S12 no-design-image). New panel tests inject a FRESH store to avoid jsdom sessionStorage cross-test leakage.

**Definition of done (report FACTS):** `npx tsc --noEmit` clean · `npx eslint src/ui/discover` clean · `npx vitest run src/ui/discover` all pass (4 pre-existing + new) · `git --no-pager diff --stat` shows ONLY the 4 scoped files (2 new, 2 edited); frozen paths byte-unchanged. Do NOT commit — leave dirty for architect review.


> **S13 DONE `cd6fae9` (2026-09-09).** Client-only, strict TDD, NO frozen file touched. Delivered Discover task-history + resume-on-reload (defect #2). NEW `src/ui/discover/discover-persistence.ts` (+116): `createSessionStorageDiscoverStore(storage?)` mirroring `studio-persistence.ts` exactly — injectable `StoragePort`, `createMemoryStorage()` fallback, `resolveStorage()` (sessionStorage guarded → memory), single fixed key `discover-tasks`, `isDiscoverTask` guard, `load()`→`[]` on missing/corrupt/invalid, `save()` UPSERTS by `id`. `DiscoverTask = {id,runId,seed,market,productType,status:"in-progress"|"done"|"failed",startedAt,cardId?}` (id===runId). `seed-authoring-panel.tsx` (+254-39): accepts optional `taskStore` prop (defaults to the session store, held in a `useRef` so a fresh injected store is stable per test); one shared `consumeTaskSource()` helper (async-iterator + `cancelled` flag + `iterator.return()` cleanup, acts on FIRST `card:ready`, routes to failed on non-recoverable error/throw) used by BOTH submit and mount-resume; `createTaskEventSource()` centralizes the byte-identical `{kind:"trend-card",crawl:{source:"google_trends",market,seed,productType,mode:"live"}}` request, `/api/live`, `maxReconnects:1`. On submit: mint runId, persist an in-progress task, refresh state, start SSE. On first `card:ready`: `completeTask` upserts task→done+cardId, persists, refreshes, THEN `router.push("/trends/"+cardId)` (S12 nav preserved). On mount: `store.load()` renders a `Task history` Panel (sorted desc by startedAt — done→`<a href="/trends/<cardId>">`, failed→`role="alert"`, in-progress→`role="status"`, NO `<img>` anywhere) and RECONNECTS every in-progress task via the stored runId (frozen `createSseUiEventSource` POSTs `{runId,reconnect}` in the body — FACT-verified in `sse-ui-event-source.ts` — so a late `card:ready` still completes+routes). RED first (9 tests, 5 new failed before impl): persistence 4 (empty/round-trip/upsert-by-id/corrupt→[]) + panel 5 (persist-on-submit, done+link+push on card:ready, restore-done-without-fetch on mount, resume-in-progress reconnects with stored runId, failed→error row). The 4 pre-existing panel tests kept GREEN unchanged (cleanup clears `window.sessionStorage`). Architect FACT-verified INDEPENDENTLY: `git status --short` = exactly the 4 scoped files (2 new, 2 edited); frozen audit EMPTY (`src/ui/live-theater/*`, `packages/contracts/*`, `src/bff/*`, `src/agent/*`, `src/integration/*`, `app/**` all byte-unchanged); `tsc --noEmit` clean; `eslint src/ui/discover` clean; `vitest run src/ui/discover` 13/13 (2 files) pass. Committed 4 files by the architect with explicit paths. S14 (multi-source opportunity score, G1) now unblocked — will FIRST FACT-diagnose why only google_trends is scanned before scoping, and may require a recorded frozen-unlock.


---

## S14 — Multi-source opportunity score in the author/trend-card flow (G1, defect #3) — SCOPE LOCKED + FROZEN UNLOCK (architect, 2026-09-09)

**Architect FACT diagnosis (this repo, read-only, verified 2026-09-09).**
- The live trend-card that the seller sees is produced ENTIRELY by the platform-hosted Managed Agent: `ma-event-mapper.ts` (`agent.output` → `final_card`) forwards `event.output.card` VERBATIM, so `opportunityScore`/`availableSources`/`missingSources` are whatever the MA agent emits. The agent currently emits only `google_trends`, hence a single-source score.
- `modelark-live-session.send()` (line 159) STRIPS the client `crawl.source` (`const { source: _source, mode: _mode, ...crawlContext } = request.crawl; void _source;`). So the client hardcoding `source:"google_trends"` in `seed-authoring-panel.tsx` is a RED HERRING — it never reaches the agent's source selection. The agent decides which `crawl` custom-tool-uses to run; we cannot change that from the repo (it lives on the platform side).
- The repo ALREADY contains a correct multi-source G1 builder (`src/warehouse/trend-card-builder.ts` → loops `ALL_CRAWL_SOURCES`, `reduceOpportunityComponents`, `scoreOpportunity`), but `buildTrendCard`/`ingestTrendCard` are DEAD CODE in production — grep shows no route/app calls them; only their own tests reference them.
- The scoring math is source-agnostic and correct: `reduceOpportunityComponents(records) → {components, contributingSources}` then `scoreOpportunity({components, availableSources, missingSources}) → {opportunityScore, confidence}`. G1 weights live in `packages/config` `SCORING_CONFIG.weights` (Amazon+Etsy demand 0.35 · Meta-ad proven-intent 0.30 · TikTok+Reddit+Pinterest+Google-Trends early-culture 0.25 · competition-inverse 0.10). NO scoring change needed.
- The crawl port is ALREADY wired for all 7 actors: `live-dependencies.ts` builds `createMultiActorCrawlPort({ registry: createApifyActorRegistry() })` when `APIFY_TOKEN` is present (real token confirmed), else `stubCrawlPort`. `CrawlPort.fetch({source,market,seed,productType,…}) → CrawlPortResult ({ ok:true, records: CanonicalRecord[] } | { ok:false, recoverable, message })`.
- Proven decorator seam EXISTS and already intercepts the terminal card: `src/integration/persisting-trend-card-live-session-port.ts` wraps `openEvents()`, watches `event.type === "final_card"` when `lastRequest.kind === "trend-card"`, and persists the card. This is the exact place to re-score.

**DECISION — HƯỚNG B (user-approved 2026-09-09): repo re-scores the card server-side after the agent returns, using the existing multi-actor CrawlPort + the existing G1 reducer/scorer. Do NOT try to steer the platform agent (Hướng A rejected — out of repo control).**

**Frozen-file unlock (S14 scope ONLY) — AUTHORIZED (user-approved 2026-09-09).**
> To land S14, `src/integration/*` is temporarily unlocked ONLY to add a NEW rescoring decorator and wire it into `buildLiveDependencies`. Specifically:
> - NEW file `src/integration/rescoring-live-session-port.ts` (+ its `__tests__`) — a `LiveSessionPort` decorator, same shape/idioms as `persisting-trend-card-live-session-port.ts`.
> - EDIT `src/integration/live-dependencies.ts` ONLY to inject the new decorator into the port chain (pass the already-built `crawl` CrawlPort) and place it BEFORE `createPersistingTrendCardSessionPort` so the RE-SCORED card is what gets persisted + streamed.
> - `packages/contracts/*`, `src/bff/*`, `src/agent/*` (incl. `modelark-live-session.ts`, `ma-event-mapper.ts`), `src/ui/*`, `app/**`, `src/warehouse/*`, `src/scoring/*`, `packages/config/*`, all `.env*`, and migrations STAY FROZEN. Read-only imports from frozen modules allowed (`reduceOpportunityComponents`, `scoreOpportunity`, `ALL_CRAWL_SOURCES`, the `CrawlPort`/`CanonicalRecord`/`TrendCard`/`CrawlSource` types, `LiveSessionPort`/`LiveRun`/`RawMaEvent`/`BffRequest`). Re-freeze `src/integration/*` after the S14 merge.
> Rationale for the minimal blast radius: the score is a repo-owned derivation; the smallest correct fix is a decorator that recomputes it from real crawl data WITHOUT touching the contract, the wire-shape, the agent loop, or the UI. No `TrendCard` field is added or renamed — only the VALUES of `opportunityScore`/`confidence`/`availableSources`/`missingSources` (all already on the card) are overwritten.

**Scope — ONLY these files (server-only):**
- NEW `src/integration/rescoring-live-session-port.ts` (implementation)
- NEW `src/integration/__tests__/rescoring-live-session-port.test.ts` (tests)
- `src/integration/live-dependencies.ts` (wire the decorator into the chain)

**Decorator behaviour (`createRescoringLiveSessionPort`).**
- Signature: `createRescoringLiveSessionPort({ inner: LiveSessionPort, crawl: CrawlPort }): LiveSessionPort` — mirror `createPersistingTrendCardSessionPort` structure (`create(runId)` → wrap `history`/`openEvents`/`send`/`cancel`; remember `lastRequest` in `send`).
- In `openEvents`, for the FIRST `event.type === "final_card"` where `lastRequest?.kind === "trend-card"`:
  1. Fan out `crawl.fetch({ source, market: card.market, seed: card.seed, productType: card.productType })` across ALL 7 `ALL_CRAWL_SOURCES` IN PARALLEL (`Promise.allSettled`). Collect `records` from every `{ok:true}` result; ignore `{ok:false}`/rejected sources (they become "missing").
  2. `const reduction = reduceOpportunityComponents(allRecords);` → `const contributing = new Set(reduction.contributingSources);` → `availableSources = ALL_CRAWL_SOURCES.filter(s => contributing.has(s))`, `missingSources = ALL_CRAWL_SOURCES.filter(s => !contributing.has(s))`.
  3. `const scoring = scoreOpportunity({ components: reduction.components, availableSources, missingSources });`
  4. Yield a re-scored card: `{ ...card, opportunityScore: scoring.opportunityScore, confidence: scoring.confidence, availableSources, missingSources }` (event `{ ...event, card: rescored }`). Every OTHER event passes through UNCHANGED and in order.
- **SAFETY GUARD (mandatory — prevents dev/offline regression):** if the rescore yields `availableSources.length === 0` (e.g. `stubCrawlPort` returns records with no `normalizedValue`, so nothing contributes), DO NOT overwrite — yield the ORIGINAL agent card unchanged. Also if `crawl` fetches all throw/`{ok:false}`, yield the original card. Rescore is BEST-EFFORT and must NEVER downgrade a valid agent card to a zero-evidence card. Wrap the whole rescore in try/catch → on any throw, yield the original event unchanged.
- Single-consumption preserved (one async generator, forward-then-yield). Only the first `final_card` is rescored (a `rescored`/`saved`-style flag like the persistence decorator).
- Place in the chain BEFORE persistence: `inner → rescoring → persistence(trend-card) → project-persistence` ordering so the persisted + streamed card carries the multi-source score. (Concretely in `live-dependencies.ts`: wrap `innerLiveSessions` with `createRescoringLiveSessionPort({ inner: innerLiveSessions, crawl })`, then feed THAT into the existing `withProjectPersistence`/`createPersistingTrendCardSessionPort` composition. Confirm ordering by FACT in the file — the rescoring wrap must be inside the trend-card-persistence wrap so persistence sees the rescored card.)

**RED cases (must fail first) — `rescoring-live-session-port.test.ts` (use fakes; no network).**
1. **rescoreS a trend-card final_card from multi-source crawl.** Fake inner run emits a `final_card` whose card has a single-source score (e.g. `opportunityScore: 10, availableSources:["google_trends"], missingSources:[the other 6]`). Fake `CrawlPort` returns contributing records for demand (amazon/etsy), provenIntent (meta_ads), earlyCulture (google_trends/tiktok/…), competitionInverse. Assert the yielded card's `availableSources` now includes the multi-source set, `missingSources` is the complement, and `opportunityScore`/`confidence` equal what `scoreOpportunity` returns for those components (compute the expected value via the real `scoreOpportunity` in the test, or assert `> 10` AND deep-equal the recomputed result). Assert `crawl.fetch` was called once per source (7 calls) with the card's seed/market/productType.
2. **passes through non-trend-card runs untouched.** `lastRequest.kind === "generate-design"` (or `deep-dive`) → the `final_card` is yielded VERBATIM, `crawl.fetch` NOT called.
3. **safety guard: no contributing records → original card unchanged.** Fake `CrawlPort` returns `{ok:true, records:[]}` (or records with no `normalizedValue`) for every source → yielded card === original agent card (same `opportunityScore`/`availableSources`), NOT a zeroed card.
4. **safety guard: crawl failure → original card unchanged.** Fake `CrawlPort.fetch` rejects / returns `{ok:false}` for all sources → original card passed through; no throw escapes `openEvents`.
5. **only the first final_card is rescored + all other events pass through in order.** Feed `scanning?/synthesizing?/final_card/answer/done` (or a second `final_card`) → assert non-card events are forwarded unchanged and in the original order, and rescore runs once.
- (Optional 6, if cheap) **wiring smoke:** a light assertion in `live-dependencies` land or a comment-verified FACT that the rescoring wrap sits inside the trend-card-persistence wrap. If not unit-testable without DB, SKIP and rely on the architect's FACT read of the composed chain.

**GREEN implementation guidance.**
- Copy the exact decorator idioms from `persisting-trend-card-live-session-port.ts` (async-generator `openEvents`, `lastRequest` capture in `send`, `cancel` passthrough, best-effort try/catch that never interrupts the MA event stream). Import `reduceOpportunityComponents` + `ALL_CRAWL_SOURCES` from `../warehouse/component-reducer`, `scoreOpportunity` from `../scoring/opportunity-score`, `CrawlPort` from `../agent/ports`, types from `../bff/types` and `../../packages/contracts`.
- Keep it PURE server-side; no UI, no contract, no wire change. Do NOT edit `modelark-live-session.ts` or `ma-event-mapper.ts`. Do NOT add fields to `TrendCard`.
- Ensure no unused imports so tsc/eslint stay clean.

**Definition of done (report FACTS):**
- `npx tsc --noEmit` clean.
- `npx eslint src/integration` clean.
- `npx vitest run src/integration` — all pass (new rescoring tests + pre-existing integration tests unchanged in intent).
- `npx vitest run` FULL suite — no regressions (report file/test counts vs the S13 baseline 99 files / 541 tests region).
- `git --no-pager diff --stat` shows ONLY the 3 scoped files (2 new, 1 edited); confirm `packages/contracts/*`, `src/bff/*`, `src/agent/*`, `src/ui/*`, `app/**`, `src/warehouse/*`, `src/scoring/*`, `packages/config/*`, `.env*` are byte-unchanged.
- Do NOT commit — leave the working tree dirty for the architect to review and commit. Re-freeze `src/integration/*` after merge.


---

## S14 — DONE (architect FACT-verified + committed, 2026-09-09)

**Commit:** `c2d12ec feat(integration): S14 multi-source opportunity rescoring decorator (G1, defect #3)` — 3 files changed, 457 insertions(+), 2 deletions(-).

**Delivered (Hướng B — server-side rescore decorator):**
- NEW `src/integration/rescoring-live-session-port.ts` — `createRescoringLiveSessionPort({ inner, crawl }): LiveSessionPort`. Mirrors the `persisting-trend-card-live-session-port.ts` idioms (wrap `create(runId)`, passthrough `history`/`cancel`, capture `lastRequest` in `send`, single forward-then-yield async-generator `openEvents`). On the FIRST `final_card` where `lastRequest?.kind === "trend-card"` (guarded by a `rescored` flag set BEFORE the try, so a throw can never re-trigger on a later card): fan out `crawl.fetch({source, market, seed, productType})` across all 7 `ALL_CRAWL_SOURCES` via `Promise.allSettled`, collect records from `fulfilled && ok` only, `reduceOpportunityComponents`, derive `availableSources`/`missingSources` from `ALL_CRAWL_SOURCES` + contributing set, `scoreOpportunity`, and yield `{...event, card:{...card, opportunityScore, confidence, availableSources, missingSources}}`.
- SAFETY GUARD (verified in code): if `availableSources.length === 0` → fall through to the ORIGINAL event (never downgrade a valid agent card, e.g. under offline `stubCrawlPort`). Whole rescore in try/catch → any throw also falls through to the original event. Best-effort; never interrupts the MA stream.
- EDIT `src/integration/live-dependencies.ts` — inserted `const rescoredLiveSessions = createRescoringLiveSessionPort({ inner: innerLiveSessions, crawl })` and fed it into the existing project-persistence input/fallback. Verified final chain: `inner → rescoring → project-persistence → trend-card-persistence`, so the trend-card persistence layer observes + persists the RESCORED card.
- NEW `src/integration/__tests__/rescoring-live-session-port.test.ts` — 5 tests (pure fakes, no net/DB): (1) multi-source rescore — proves parallel fan-out (all 7 fetches initiated before any resolves via deferred promises), deep-equals score/confidence against the REAL `reduceOpportunityComponents`+`scoreOpportunity`, asserts `>10` + exact per-source call args; (2) non-trend-card passthrough (ref-identity, 0 crawl calls); (3) no-contributors → original card preserved by reference; (4) all-crawl-fail (throws + `{ok:false}` mix) → original card preserved, no throw escapes; (5) only-first-`final_card` rescored + event order/ref-identity preserved + exactly 7 crawl calls (not 14).

**Architect FACT verification (independently re-run, not Codex self-report):**
- RED shown first: 2 failed / 3 passed against a passthrough scaffold (behavioral failures — expected 7-source `availableSources`, received `["google_trends"]`; first card retained object identity). The 3 safety tests correctly pass against a passthrough since they assert PRESERVATION.
- `npx tsc --noEmit` — clean. `npx eslint src/integration` — clean.
- `npx vitest run` FULL — **101 files / 555 tests all pass** (16.38s). Delta vs the old 99/541 stamp = S13 (+1 file/+9 tests) + S14 (+1 file/+5 tests); no regression.
- `git status --short` = ONLY the 3 scoped files pre-commit; frozen audit (`packages/contracts src/bff src/agent src/ui app src/warehouse src/scoring packages/config`) EMPTY. Post-commit tree clean.

**RE-FREEZE:** `src/integration/*` is re-frozen effective this stamp. The S14 unlock is closed. Future edits require a fresh scoped unlock. Frozen set restored to: `src/ui/live-theater/*`, `packages/contracts/*`, `src/bff/*`, `src/agent/*`, `src/integration/*`, `app/**`, `src/warehouse/*`, `src/scoring/*`, `packages/config/*`, all `.env*`, migrations. (`src/ui/discover/*`, `src/ui/studio/*` remain non-frozen.)


---

## Phase O (Observability) — S15: Per-step structured logging + UI progress

> Context: after S14, the seller/product owner (2026-09-09) reported that the system emits no useful logs: clicking "Create a Trend Card" runs 15–20 min with the server log showing only default Next.js access lines (`POST /api/live … 200 in 57467ms`) plus SSE reconnects (14s/8s/5s/11s), no per-step request/response, no failure reason, and the UI shows only a static "Creating your Trend Card…" with no indication of which step the task reached. ADDED REQ (same day): log the TASK PROGRESS so the user can see which step the task is on, where it failed, and why — every line WITH a timestamp.
>
> Architect FACT diagnosis (read-only, from source): (1) the request path has ZERO structured logging — `src/integration/live-route.ts`, `src/bff/sse-stream.ts`, `src/agent/modelark-live-session.ts`, `src/agent/modelark-managed-agent-client.ts` contain no `console.*`/logger. (2) The metric framework DOES already instrument every step (`measured()` records `ptv_infra_operation_*` for `session_attach_or_create`/`send`/`event_stream`/`submit_tool_result`/`history_read`; `modelark-live-session` records per-crawl-source outcomes + `ptv_trend_card_build_total`; `sse-stream` records `ptv_sse_event_total`/`ptv_sse_stream_total`; `live-route` records `ptv_live_request_total`), BUT `buildLiveDependencies()` never passes a `metricSink`, so `createLivePostHandler` falls back to `NOOP_METRIC_SINK` and every observation is discarded. So the "progress framework" already exists; it is silenced. (3) The UI (`src/ui/discover/seed-authoring-panel.tsx` `consumeTaskSource`) receives the intermediate `scanning`/`synthesizing`/`image:ready`/`answer` UiEvents but ignores all of them — it only acts on `card:ready`/`error` — so the browser already gets step signals and just renders a static label.

### Frozen-file unlock (Phase O / S15 scope only)

> AUTHORIZED UNLOCK (user-approved 2026-09-09, "OK, duyệt."): to land S15, the following otherwise-FROZEN files are temporarily unlocked ONLY for the minimal, explicitly-scoped, ADDITIVE logging edits below. No contract, wire-shape, event-ordering, scoring, or control-flow change. Best-effort logging only — a logging failure must NEVER interrupt the MA event stream or change any response.
>
> 1. `src/integration/live-dependencies.ts` — build a real logging `MetricSink` (the new `console-log-sink.ts`, see below) and pass it as `metricSink` into the dependencies so the existing per-step metrics stop hitting `NOOP_METRIC_SINK`. Optionally also thread it to the ModelArk client / live session builders that already accept a `metricSink` option. This is MANDATORY — without it every log stays silent.
> 2. `src/integration/live-route.ts` — emit a request-lifecycle log line at START (kind/seed/market/runId) and END (outcome + total duration + failure reason). ADDITIVE next to the existing `recordRequest` calls; no control-flow change.
> 3. `src/bff/sse-stream.ts` — emit a log line for each translated step event (`scanning`/`synthesizing`/`image:ready`/`answer`/`card:ready`, emitted/deduplicated/unmapped) and for the stream terminal outcome (`done`/`fatal_error`+reason/`cancelled`). ADDITIVE beside the existing `recordEvent`/`recordStreamOutcome` calls.
> 4. `src/agent/modelark-live-session.ts` — emit a log line for each crawl source outcome (source → success/empty/failure + reason) and for the final-card build outcome (complete/degraded/zero_evidence). ADDITIVE beside the existing `metricSink.record` calls.
>
> NOTE: `src/agent/modelark-managed-agent-client.ts` already calls `recordOperation()` (with duration) for every ModelArk op via `measured()`, so once a non-NOOP sink is injected it produces per-op timestamped logs WITHOUT editing that file — it stays FROZEN.
>
> NEW files (NON-frozen, no unlock needed): `src/monitoring/console-log-sink.ts` (a `MetricSink` decorator that wraps an inner sink, forwards `record()` to it, AND writes one structured JSON line per observation to stdout with an ISO timestamp) + `src/monitoring/__tests__/console-log-sink.test.ts`.
>
> UI change (NON-frozen, no unlock needed): `src/ui/discover/seed-authoring-panel.tsx` (+ its test) — render a dynamic step label derived from the streamed UiEvents (e.g. `Scanning google_trends…` → `Synthesizing…` → `Generating design…`) instead of the static "Creating your Trend Card…". Consume the intermediate events in `consumeTaskSource` without breaking the existing `card:ready`/`error` termination.
>
> STILL FROZEN (untouched): `packages/contracts/*` (no new metric/event types — reuse existing `MetricObservation`/`UiEvent`), `src/bff/types.ts`, `src/bff/router.ts`, `src/bff/sse-translator.ts`, `src/bff/ma-event-mapper.ts` (n/a), `src/agent/modelark-managed-agent-client.ts`, `src/agent/ma-event-mapper.ts`, `app/**`, `src/warehouse/*`, `src/scoring/*`, `packages/config/*`, all `.env*`, migrations, `src/ui/live-theater/*`.
>
> LOG FORMAT: one JSON object per line to stdout via `console.log`, each carrying at minimum `ts` (ISO-8601), `metric`/`step` name, `runId` when available, `outcome`, `durationMs` when available, and a `reason`/`message` on failures. SECRETS: never log the ModelArk `apiKey`/`authorization` header or full request bodies — log only structured step metadata (kind/seed/market/source/outcome/duration/reason).
>
> Re-freeze all four unlocked files after the S15 merge; a DONE stamp with commit + independent FACT verification will close this unlock.

| Task | Area | Status | Notes |
|-|-|-|-|
| **S15** | Per-step structured logging + task-progress log (with timestamps) + UI step indicator | NEW `src/monitoring/console-log-sink.ts` (+test); EDIT (unlocked) `src/integration/live-dependencies.ts`, `src/integration/live-route.ts`, `src/bff/sse-stream.ts`, `src/agent/modelark-live-session.ts`; EDIT (non-frozen) `src/ui/discover/seed-authoring-panel.tsx` (+test) | 📋 SCOPE LOCKED + UNLOCK (approved, see block above) | Backend: inject a real logging `MetricSink` so every already-instrumented step (session attach/create, send, event_stream, submit_tool_result, per-crawl-source, final-card build, each SSE step event, stream terminal outcome, request start/end) prints one timestamped JSON line incl. outcome + duration + failure reason; redact secrets. UI: dynamic step label from streamed events. FROZEN edits are ADDITIVE-logging only, best-effort, never alter response/order/scoring. |
