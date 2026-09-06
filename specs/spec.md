# Spec — Printerval AI Design Intelligence (MVP)

> WHAT & WHY only. No HOW (no tech stack, no architecture). Frozen after grill-me (G1 passed). If a "how" leaked in here, move it to plan.md.

## 1. Problem

Printerval POD sellers/designers must do heavy market research before designing (US/EU markets), but most lack the resources to do it well: they can't spot rising niches before saturation, don't know competitor pricing/ads, miss market-specific holidays (the #1 POD sales driver), and take too long from idea to first draft design.

## 2. Users & jobs-to-be-done

- **Seller/designer** wants to: (a) discover a rising opportunity early, (b) understand real demand + competition, (c) get from opportunity to a draft design fast.

## 3. Value delivered (3 tiers)

1. **Early opportunity detection** — ranked list of accelerating niches/topics per market + holiday, with an opportunity score. WHY: catch signals 2–6 weeks before they surface on Amazon/Etsy.
2. **Real demand & competition** — actual demand, price bands, competition level, and competitor ads currently spending. WHY: evidence of "money already there", not guesswork.
3. **Opportunity → design** — auto-generated design concept + draft image, refined in-product. WHY: cut idea→first-draft from hours to minutes.

## 4. Functional requirements

- FR1: Seller picks topic / holiday / market from guided suggestions → sees a grid of Trend Cards.
- FR2: A Trend Card shows: opportunity score, trend chart, reference images, recommended action + reasoning, and a data-confidence indicator.
- FR3: Cards seen before / precomputed load instantly; a brand-new topic triggers a live multi-source scan shown in real time ("Live Theater").
- FR4: Seller generates a design concept + draft image from a card, then refines it.
- FR5: Seller publishes the design to Printerval (the GMV action).
- FR6: A secondary chat panel lets the seller deep-dive a specific opportunity on demand.
- FR7: Confidence must reflect which sources were available (e.g. a missing source lowers and flags confidence).
- FR8: Generating a design from an existing Trend Card MUST reuse that card's already-collected warehouse data. It MUST NOT trigger a fresh live multi-source crawl. WHY: the crawl already happened when the card was built; re-crawling on every design generation wastes latency + paid API spend and can produce a card-vs-design data mismatch. Live crawling belongs only to card creation (FR3), never to design generation.
- FR9: When a seller wants a design for a topic that has no Trend Card yet, the seller can author their own card by supplying a seed (topic + market + product type). This runs the card-creation path (FR3: warehouse lookup first; only a genuine cache-miss triggers a live scan), the resulting card is saved to the warehouse for reuse, and the seller then generates a design from it (per FR8). WHY: keeps the product's "intelligence" (every design is grounded in a Trend Card) while still letting sellers pursue not-yet-precomputed topics; a seller-authored card benefits the next seller via the cache. [STATUS: ✅ implemented — P10, commit `6222548`; the synthesized `final_card` is persisted to `trend_cards` (with its seed embedding) by a persisting LiveSessionPort decorator on trend-card runs, and a `SeedAuthoringPanel` provides the seed-input UI.]

- FR10: Deep-diving an EXISTING warehouse Trend Card MUST answer from that card's already-collected warehouse data and MUST NOT trigger a fresh live multi-source crawl (mirror of FR8, applied to the deep-dive lane). Live crawling belongs only to card creation (FR3). WHY: the crawl already happened when the card was built; re-crawling on every deep-dive question wastes latency + paid API spend and risks a card-vs-answer data mismatch. A deep-dive on a not-yet-warehoused seed follows the FR9 author-a-card path (lookup first; only a genuine miss scans). [STATUS: ✅ implemented — E1, commit `21baac9`; warehouse-first fulfillment enforced at the crawl-tool layer, verified `FakeCrawlPort.calls` empty on a warehouse hit.]
- FR11: The deep-dive panel is a multi-turn conversation: after an answer, the seller can ask a follow-up question and receive a new answer in the same panel, with each Q&A shown as a distinct turn. The conversation MUST persist across navigation (leaving the card and returning re-shows prior turns) and across process restarts (the runId->MA-session mapping is durable, not in-memory-only). WHY: a single-shot, memory-only chat that silently no-ops on the second question and forgets history on reload is unusable for real research. [STATUS: PARTIAL. ✅ Multi-turn conversation — E2, commit `7e8ef0e`. ✅ Durable runId→MA-session mapping across process restarts — E3, commit `b341876`. ⏸️ NOT YET MET: persistence across NAVIGATION — `deep-dive-screen.tsx` keeps turns in local React `useState`, so leaving the card and returning starts empty. This gap is characterized by test D4 (`deep-dive-screen.test.tsx`) and tracked as task E6 (pending user approval).]
- FR12: A Trend Card presents seller-actionable intelligence in two forms on the UI: (a) an INSIGHT DASHBOARD of derived metrics computed from the card's collected data - demand & momentum (search-interest growth %, momentum/acceleration, peak/seasonality window, current-vs-peak), money & competition (price band min/median/max, active-ad ratio, competitor count/saturation, proven-intent flag from Meta Ads), and confidence (source coverage, freshness, confidence %); and (b) a structured TEXT OPPORTUNITY REPORT with six sections - Verdict/TL;DR (score + Act now / Watch / Skip), Why it is rising, Money & competition, Whitespace/differentiation, Recommended action (product type, price point, launch-by date, design angle), and Confidence & caveats. WHY: the current card shows only a two-sentence recommendation and leaves the rich collected data (trend series, competitors, scores, sources) unsynthesized, so a seller cannot judge or act on the opportunity. [STATUS: ✅ implemented — E4, commit `7faeb55`; pure `deriveSellerInsights(card)` + detail-screen dashboard/report blocks, UI render locked by test D1.]
- FR13: Reference images on a Trend Card MUST be real, loadable image URLs sourced from the collected culture data (e.g. Pinterest/TikTok reference imagery extracted during the crawl), not placeholder/non-resolving hosts. Seed/dev fixtures that use non-existent hosts (e.g. tos.example) are for local bootstrapping only and MUST NOT surface as broken images in a warehouse-served card; the image host allowlist (next.config) must permit the real source domains. WHY: broken reference images undermine the card's core "see the visual direction" value. [STATUS: ✅ implemented — E5, commit `4a7561c`; dev seed uses real Wikimedia Commons URLs, `next.config` allowlists `commons.wikimedia.org` + `upload.wikimedia.org`, regression-guarded by test D3.]

## 5. Non-functional requirements

- NFR1: Fast-path interactions feel instant (served from warehouse).
- NFR2: Slow-path (live scan / generation) shows first progress event quickly so the wait feels productive.
- NFR3: Public market data + seller creative assets only; no end-consumer PII.
- NFR4: Copyright-infringing image content is blocked at generation; seller guided to adjust.
- NFR5: Meta Ad Library is a priority source; TikTok is best-effort — the product still works if TikTok is temporarily down.

## 6. Monetization (business intent, not implementation)

- GMV-first: every opportunity/design funnels to "Publish to Printerval"; Printerval earns POD commission.
- Credits meter expensive actions (AI design generation, deep analysis) — secondary revenue + abuse guard.
- MVP: no hard subscription; prioritize GMV + habit formation.

## 7. Out of scope (MVP)

- Instagram / YouTube sources (Phase 2).
- Full automated eval pipeline (Phase 2).
- Multi-region, auto-scaling, multi-language UI (Phase 2).
- Per-seller trend-card ownership + a "My Trend Cards" tab (Phase 2). Today `trend_cards` is a SHARED/global warehouse keyed by id/seed/market with one shared embedding and NO `seller_id` column; FR9 seller-authored cards are persisted to that shared cache on purpose (a card authored by one seller benefits the next seller via the cache — the intended FR9 behavior). A personalized "My Trend Cards" view (each seller sees the cards THEY authored, in a dedicated tab beside Discover) is deferred and requires: (a) a schema change to attribute authorship — add a `seller_id` column (or a join table) to `trend_cards`, which is a FROZEN contracts/migrations change needing a scoped, user-approved unlock; (b) a write-path change to stamp `sellerId` (injected from the authenticated session, never trusted from client JSON — mirrors the monetization contracts) when the persisting decorator saves an authored card; (c) a read-path + UI change (a seller-scoped query and a new tab/route). Note this is a design decision, not a bug: a per-seller store trades away the shared-cache reuse benefit. Depends on the seller-auth mechanism still deferred as part of P3 (there is no app-wide seller identity yet).
- Credit metering + seller authentication for metered actions (Phase 2). The credit contracts, config (packages/config/credits.config.ts), and DB tables (credit_accounts, credit_debit_decisions, credit_ledger_entries) already exist, but are NOT wired into the composition root: buildLiveDependencies returns no credits/authenticateSeller, so live-route.ts takes the unmetered path (guarded by its `monetized` check, dong 160-168 — not a crash). Deferred work (was called "P3" in review): (a) a real PostgresCreditRepository implementing the 5-method CreditRepository contract with idempotency + optimistic locking (version column) + refund-on-failure; (b) a seller authentication mechanism (none exists app-wide today — needs an arch decision: stub seller-id vs header vs real auth); (c) wiring both into buildLiveDependencies. Business intent in §6 (secondary revenue + abuse guard). Until shipped, generate-design / deep-dive run free and unauthenticated.

## 8. Acceptance signals

- A seller can go from "pick a holiday+market" → see scored opportunities → generate a draft design → publish, in one sitting.
- A cache-miss topic returns a usable Trend Card via live scan with visible progress.
- Removing a source (simulate TikTok down) still yields opportunities with lowered, flagged confidence.
- Generating a design from an existing warehouse Trend Card completes WITHOUT any live crawl (no Apify call); the same seed re-run stays warehouse-served.
- A seller can author a brand-new card from a seed for a topic absent from the warehouse; it is persisted and then usable for design generation.
