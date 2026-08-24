# AGENTS.md — read this first (Codex) 

This repo follows a controlled agentic workflow. Before doing ANY task:

1. Read `constitution.md` — the non-negotiable rules. Never break one silently.
2. Read `specs/spec.md` (WHAT/WHY) and `specs/tasks.md` (your assigned feature + owner dirs).
3. Read `contracts/contracts.md` — these types are FROZEN. Do not change them. Communicate with other features only through these contracts.
4. If your task is a "drift hotspot" (scoring, cache, adapters, SSE, degrade), read `specs/spec-hotspots.md` and write the RED test FIRST.

## Working rules (hard)
- Stay inside your feature's owner directories (see tasks.md ownership map). Do not edit files owned by another feature.
- 1 feature = 1 branch = 1 worktree = 1 PR. Sub-steps stay in the same worktree.
- TDD for behavior-specifiable code (🔴/🟡 lanes): red test → green → refactor. UI/glue (🟢): build + verify by running.
- Migrations are append-only, timestamp-named (`NNNN_desc.sql`).
- Do NOT call any model/LLM endpoint via raw HTTP. Image gen goes through the MA Seedream custom tool only.
- Secrets: backend-only keys never in code.

## Before you say "done"
- Tests you added are green; typecheck + lint pass.
- You actually ran the relevant behavior (not just assumed).
- Your diff stays within your owner dirs.
- Commit trailer: `Co-authored-by: <agent/model> task:<id>`.

## Plan-mode
For any non-trivial task: first output a short PLAN (files you'll touch + test you'll write) and WAIT for human approval before editing. Read-only exploration is fine without approval.

---
(For Claude Code, `CLAUDE.md` is a symlink/duplicate of this file — same rules.)
