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

## 8. Acceptance signals

- A seller can go from "pick a holiday+market" → see scored opportunities → generate a draft design → publish, in one sitting.
- A cache-miss topic returns a usable Trend Card via live scan with visible progress.
- Removing a source (simulate TikTok down) still yields opportunities with lowered, flagged confidence.
