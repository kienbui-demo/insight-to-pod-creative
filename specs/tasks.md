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

### Approved execution order: S5 (#2,#3) -> S6 (#4-img,#5,#1-img) -> S7 (#4-label) -> S8 (#6) -> S9 (#1-badge)

| ID | Feature | Owner dir(s) / files | Status | Lane | Notes |
|-|-|-|-|-|-|
| **S5** | Full draft-design TEXT block + Generate Design button beneath it (#2, #3) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done `2516b54` | Full TDD | Render a dedicated block that shows the FULL draft-design brief text (the agent's `answer` markdown), not just `card.recommendation.action`. Place the Generate Design button directly beneath that brief block. Client-only; no frozen files. Design question for the RED brief: the "full brief" text is the MA `answer` — decide whether it is the pre-generation concept (shown before Generate) vs. the streamed answer (shown during/after the run); FACT shows `answer` arrives late in the SSE stream, so the pre-generation brief must come from `card` fields already on screen (holistic concept), while the streamed `answer` feeds the result block. Keep `card.recommendation.action` visible; ADD the fuller text block. RED first (assert the full brief text + a Generate button render). |
| **S6** | Generation loading bar ("Đang tạo ảnh thiết kế ...") + server-side proxy-download so the Seedream image actually displays (#5, #4-image, #1-image) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx`, `app/api/design-image/route.ts` (NEW), `app/api/design-image/__tests__/route.test.ts` (NEW) | ✅ Done `a941004` | Full TDD | Two parts. (A) UI: after Generate Design is clicked and while the run is between `synthesizing` and `image:ready`, show a loading bar labelled exactly "Đang tạo ảnh thiết kế ..." in the result block; when `image:ready` arrives, show the image. (B) Backend proxy: NEW additive route `GET /api/design-image?src=<encoded TOS url>` that fetches the signed TOS bytes SERVER-SIDE and streams them to the browser (fixes the raw signed-URL / CORS / expiry failure). SSRF guard: validate the `src` host against the Seedream TOS host allowlist (`*.tos-ap-southeast-1.volces.com` / the exact host used by `modelark-seedream-image-port.ts`) and reject anything else. Client rewrites the `image:ready` url to `/api/design-image?src=<encoded>` before rendering `<img>`. No contract change (client-side URL rewrite + additive route). RED first for BOTH the route (allow valid host, reject other host, stream bytes) and the loading-bar UI. |
| **S7** | Status label must not regress to "Synthesizing signals" after image:ready (#4-label) | `src/ui/live-theater/creator-view-state.ts`, `src/ui/live-theater/live-theater.tsx`, `src/ui/live-theater/live-theater.test.tsx` | ✅ Done `bd211fd` | Full TDD | AUTHORIZED UNLOCK (see block below). Fix the reducer so a `synthesizing` frame that arrives AFTER `image:ready` does NOT reset the stage back to "synthesizing" (e.g. once stage has reached "image-ready", a later synthesizing frame keeps the terminal/image-ready label, or the label is derived from the max stage reached). NO change to the UiEvent contract, the SSE translator, or the event ordering — this is a pure client reducer/label fix. RED first: feed `synthesizing → image:ready → synthesizing` and assert the header does NOT read "Synthesizing signals" after the image. |
| **S8** | Resume-to-checkpoint (auto-reopen in-flight/last run) + side task-history list (#6) | `src/ui/studio/studio-persistence.ts`, `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/studio-persistence.test.ts`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ✅ Done `10ca4bb` | Full TDD | Client-only; no frozen files. (A) Persistence model: extend the store with a run-status / task record (e.g. `{runId, status: 'in-flight'|'done'|'error', startedAt, ...}`) so a run's lifecycle survives reload. (B) Resume: on mount, if a last/in-flight run exists, set `started=true` and reopen it (auto-reconnect via the existing `sse-ui-event-source` `reconnect` path for in-flight; replay/show result for done) INSTEAD of dropping to the "Generate your first draft" panel. Reconcile with S4a: S4a mints a FRESH runId on Generate-after-restore to avoid the dead-session 400 — resume must reopen an IN-FLIGHT run WITHOUT minting a new id (only mint fresh when the seller explicitly starts a NEW generation), so the S4a rule narrows to "fresh id on explicit new Generate", not "fresh id on every restore". (C) Side task-history list: a panel listing prior/known runs for the card; clicking one reopens it to view progress/result. RED first for the new store fields AND the mount-restore-sets-started behavior AND the task-list render+click. |
| **S9** | "Served from warehouse" badge (#1) | `src/ui/studio/design-studio-screen.tsx`, `src/ui/studio/__tests__/design-studio-screen.test.tsx` | ⏳ TODO | Full TDD | Client-only; no frozen files; latency OUT of scope per user. Show a small "served from warehouse" badge when the run was warehouse-served. Signal source (verify in RED brief): after S4b the warehouse-served run emits NO `scanning` event, so the client can infer warehouse-served = (run produced results WITHOUT any `scanning` frame). If that inference proves too fragile in the brief, escalate to the user before adding any contract/event field (do NOT unfreeze contracts unilaterally). RED first: a run with no scanning frame renders the badge; a run with a scanning frame does not. |

### Frozen-file unlock (Phase S round 2 / S7 scope only)

> AUTHORIZED UNLOCK (user-approved 2026-09-07): to land S7, `src/ui/live-theater/creator-view-state.ts` and `src/ui/live-theater/live-theater.tsx` (both under the FROZEN `src/ui/live-theater/*` set) are temporarily unlocked ONLY to stop the status label regressing to "Synthesizing signals" when a `synthesizing` frame arrives after `image:ready`. NO change to the `UiEvent` contract, `packages/contracts/*`, `src/bff/sse-translator.ts`, `src/bff/ma-event-mapper.ts`, `src/agent/*`, event ordering, or the S2 answer-image rendering. Re-freeze both files after the S7 merge. (Status will be stamped RE-FROZEN + commit + FACT verification once merged.)


> **S5 DONE `2516b54` (2026-09-07).** The "full draft-design brief text" = `card.recommendation.reasoning` (already on the `TrendCard` contract, present at render time — NOT the late-arriving SSE `answer`). Rendered inside the existing `aria-label="Draft design concept"` panel beneath `card.recommendation.action`, with a second Generate button (`aria-label="Generate design from concept"`, distinct accessible name so the exact-name `getByRole("button", { name: "Generate design" })` lookups stay single-match) wired to the existing `startRun`. Client-only; NO frozen files touched. RED first (2 failing: reasoning text absent / concept button absent), then GREEN. Architect FACT-verified independently: `tsc --noEmit` clean, `eslint src/ui/studio` clean, `src/ui/studio` 2 files/15 tests, FULL suite 98 files/521 tests (+3 vs 518, same file count); `git --no-pager diff` audit confirms ONLY the 2 scoped files changed (+55) and `packages/contracts/*`, `src/ui/live-theater/*`, `src/ui/studio/studio-persistence.ts`, `app/**` byte-unchanged.


> **S6 DONE `a941004` (2026-09-07).** Two-part fix, strict TDD, NO frozen file touched. (A) Studio right panel now renders an `aria-label="Design result"` block: while `started && designAssetUrl===undefined` it shows a `role="status"` loading bar with the EXACT label `Đang tạo ảnh thiết kế ...`; once `recordDesign` sets `designAssetUrl` (from the `image:ready` UiEvent `{id,type:"image:ready",url}` via the existing `onImageReady`), it renders `<img alt="Generated design" src={/api/design-image?src=encodeURIComponent(url)}>`. The FROZEN `LiveTheater` is untouched (still shows the raw stream); the working display lives in the non-frozen studio panel. (B) NEW additive proxy: thin `app/api/design-image/route.ts` (GET, delegate pattern like publish/live) -> `src/integration/design-image-route.ts` `createDesignImageGetHandler({fetch})` + `buildDesignImageDependencies()`. SSRF guard: only hostnames ending `.tos-ap-southeast-1.volces.com` (the confirmed Seedream host `ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com`) pass; missing/other-host/non-http(s) -> 400 (fetch NOT called), `redirect:"manual"` blocks redirect-bypass; upstream non-OK -> 502; success streams `upstream.body` with copied content-type (default image/png) + `cache-control: private, max-age=60`. NOTE: route logic+test live in `src/integration/` (repo delegate convention), NOT `app/api/design-image/__tests__/` as the row originally listed. Architect FACT-verified INDEPENDENTLY: `tsc --noEmit` clean, `eslint src/ui/studio src/integration app/api/design-image` clean, FULL suite 99 files/527 tests (+1 file/+6 vs 98/521); `git status --porcelain` = exactly the 5 S6 paths, frozen-path grep EMPTY (`packages/contracts/*`, `src/ui/live-theater/*`, `studio-persistence.ts`, `live-route.ts`, `live-dependencies.ts`, `next.config.ts`, `app/api/live/*`, `app/api/publish/*` all byte-unchanged). Committed 5 files (+241) by the architect with explicit paths.


> **S7 DONE `bd211fd` (2026-09-07).** Reducer-only fix, strict TDD, NO frozen file touched. Root cause: `creator-view-state.ts` `case "synthesizing"` set `stage: "synthesizing"` UNCONDITIONALLY, so a TRAILING synthesizing frame (the real SSE is `synthesizing x4 -> image:ready -> synthesizing x2 -> answer -> done`) pulled the stage — and the `live-theater.tsx` header label — back from "Image ready" to "Synthesizing signals". Fix (+5-1): the `stage` assignment in the synthesizing case is now conditional — if `state.stage` is already `"image-ready"` or `"card-ready"` it KEEPS that stage, else `"synthesizing"`; `streamStatus`, `synthesisNote`, `seenEventIds` unchanged. `live-theater.tsx` was NOT modified (label is already derived from `state.stage`; reducer fix is sufficient). Added 1 regression test in `live-theater.test.tsx` (+36): `keeps the Image ready label when a synthesizing frame arrives after image:ready` — emits synthesizing -> image:ready -> trailing synthesizing, asserts header stays "Image ready" and "Synthesizing signals" is absent. RED confirmed first ("Unable to find an element with the text: Image ready", rendered header was "Synthesizing signals"). Architect FACT-verified INDEPENDENTLY: `git diff` = exactly the 2 scoped files (`creator-view-state.ts` +5-1, `live-theater.test.tsx` +36), `live-theater.tsx` byte-unchanged, all frozen paths (`packages/contracts/*`, `src/bff/*`, `src/ui/studio/*`, `app/**`) unchanged; `tsc --noEmit` clean; `eslint src/ui/live-theater` clean; FULL suite 99 files / 528 tests (+1 test vs 99/527, same file count). Committed 2 files (+40-1) by the architect with explicit paths. RE-FROZEN: per the S7 unlock block, `creator-view-state.ts` and `live-theater.tsx` are now re-frozen after this merge.


> **S8 DONE `10ca4bb` (2026-09-07).** Client-only, strict TDD, NO frozen file touched. (A) `studio-persistence.ts` gains `StudioRunStatus`/`PersistedRun` and OPTIONAL `loadRuns`/`saveRun` on a NEW key `studio-runs:${cardId}` — `saveRun` UPSERTS by runId (in-flight->done keeps ONE record in place, order preserved), `loadRuns` validates each record shape and returns [] for unknown/corrupt. (B) `design-studio-screen.tsx` splits a new `streaming` state from `started` (SSE `useMemo` + `<LiveTheater>` now gate on `streaming`, studio result panel/publish gate on `started`). Mount auto-resume is FEATURE-DETECTED (`typeof historyStore.loadRuns === 'function'`): legacy stores keep BYTE-IDENTICAL behavior (started=false, no mount fetch). When present, it picks the newest in-flight run (reopens LIVE, reusing its runId, no mint) else newest run overall (done/error: restores designAssetUrl, shows proxied `/api/design-image?src=` image, `streaming=false` so NO re-fetch — avoids the S4a dead-session 400). `startRun()` still mints a fresh id ONLY on explicit Generate-after-restore (S4a rule NARROWED to explicit Generate) and now records an `in-flight` run; `recordDesign` upserts the run to `done`. (C) NEW `aria-label="Task history"` panel lists runs (newest first) as buttons; click reopens via the same no-mint decision (done shows result w/o fetch, in-flight reopens live). Added a `beforeEach(sessionStorage.clear())` (additive) because the DEFAULT store now implements `loadRuns` over real sessionStorage — prevents run leakage between tests; NO existing test body edited. Architect FACT-verified INDEPENDENTLY: diff = exactly the 4 scoped files (`studio-persistence.ts` +62, `design-studio-screen.tsx` +126-10, +2 test files +202), frozen-path audit EMPTY (`src/ui/live-theater/*` incl. `sse-ui-event-source.ts`/`live-theater.tsx`/`creator-view-state.ts`, `src/integration/*`, `src/bff/*`, `packages/contracts/*`, `app/**`, `next.config.ts` all byte-unchanged); `tsc --noEmit` clean; `eslint src/ui/studio` clean; FULL suite 99 files / 536 tests (+8 vs 99/528, same file count); all S4a tests (`mints a fresh runId when generating after a reload restore`, `reuses the in-session runId when nothing was restored`, `on reload, shows draft concept...`, `restores previously generated designs...`) PASS unchanged. Committed 4 files (+380-10) by the architect with explicit paths.
