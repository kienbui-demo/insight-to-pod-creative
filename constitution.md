# Project Constitution — Printerval AI Design Intelligence

> Non-negotiable rules every agent (Codex / Claude Code) MUST obey. This file is the single source of truth. `AGENTS.md` and `CLAUDE.md` point here. Never violate a rule silently — if a task seems to require breaking one, STOP and ask the human.

## 1. Architectural constraints (LOCKED)

1. **Core runtime is BytePlus ModelArk Managed Agent (MA) only.** No other agent framework, no self-hosted LLM orchestration.
2. **BytePlus-native stack.** MA + TOS storage + Seedream image gen + Postgres/pgvector + compute all on BytePlus. Do not introduce AWS/GCP/Azure services.
3. **"MA = brain, cron = hands".** Everything the seller perceives as intelligent (reasoning, synthesis, dialogue, concept/design generation) is produced by MA. The cron/warehouse job only loads raw material deterministically. NEVER move reasoning logic into the BFF or cron.
4. **Two-Speed Architecture.** Fast path = BFF reads Postgres directly (no MA session). Slow path = BFF opens an MA session. Only 3 triggers spin up an MA session: cache-miss deep-dive, generate concept/design, free-form deep-dive question.
5. **UI is a structured app, NOT chatbot-first.** Chat is a secondary panel. Default screens: Discover, Trend Card detail, Design Studio, Deep-dive chat.
6. **Storage = 2 systems only.** BytePlus TOS (blobs, raw crawl JSON) + Managed Postgres with pgvector extension (Trend Cards, seller data, embeddings). pgvector is NOT a separate database.

## 2. Engineering discipline

7. **Everything is a versioned artifact in the repo.** spec / plan / tasks / contracts live in git, are reviewed, are traceable. No design decisions live only in chat.
8. **TDD is mandatory for behavior-specifiable code** (scoring, adapters, cache logic, money/credit). Write the red test first. For UI / glue / prototype code, use verify-by-running instead of forced TDD.
9. **Contract-first before parallel work.** No two agents run in parallel until the shared contract (schema/type/API/migration) they both touch is frozen.
10. **Degrade gracefully.** Any single data source failing must NOT fail the whole build. Record partial confidence; never crash the pipeline.
11. **No "done" without verifying real behavior.** Run the app / tests and observe. Do not trust an agent's self-report of success.
12. **Cost is a first-class constraint.** Paid sources (Rainforest/Amazon, Apify/TikTok+Meta) and Seedream must be behind configurable thresholds + credit gating. No unbounded loops over paid APIs. NEVER call an LLM/model endpoint directly via raw HTTP — only through MA.

## 3. Multi-agent working rules

13. **1 feature = 1 worktree = 1 session = 1 PR.** Sub-tasks run sequentially inside that same worktree; do not spawn a new worktree per task.
14. **Two agents touching the same file → serialize, never parallel.** Split work by vertical feature slice, not by horizontal layer.
15. **Merge sequentially through one queue.** Every PR must rebase onto latest main + re-run the full test suite before landing, to catch semantic conflicts.
16. **Commit provenance.** Each commit trailer records which agent/model + task id produced it.

## 4. Coding standards

- Language/stack: TypeScript everywhere feasible (BFF + UI). Node.js runtime.
- UI: Next.js + TypeScript + Tailwind + shadcn/ui. Default language English. Primary color indigo `#4F46E5`, accent amber.
- Every module: narrow interface, hide complexity (deep modules).
- Every public function touching a contract has a test.
- No secrets in code. Backend-only keys (Rainforest, Apify, TOS, Postgres) live in the secret store / BFF env; MA-vault keys = Seedream (+ optional Etsy/Firecrawl).

## 5. Definition of Done (per feature/PR)

- [ ] Red tests written first for behavior-specifiable logic, now green
- [ ] Real-behavior verified (app runs / endpoint responds / image renders)
- [ ] Reviewed on 2 axes: Standards (repo conventions) + Spec (does what spec asked)
- [ ] No cross-feature file overlap unresolved
- [ ] Rebased on latest main, full suite green in merge queue
