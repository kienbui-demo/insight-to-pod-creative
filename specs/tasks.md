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

> Deferred to Phase 2 (out of MVP scope, spec.md §7): P3 credit metering + seller auth; real Printerval adapter (P2 hardening); Instagram/YouTube sources; full eval pipeline; multi-region/multi-language.

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

> Execution order (completed): **E4 ✅ -> E2 ✅ -> E1 ✅ -> E3 ✅ -> E5 ✅**, then test-hardening `3158ec9` ✅, then **E6 ✅ `2829c1e`** (FR11 navigation persistence, client-side sessionStorage). Rationale for original order: E4 had zero frozen-file coupling (fastest win + immediate seller value); E2/E1 shared the deep-dive lane; E3 was the durability backstop for E2; E5 was a small seed/config fix.
