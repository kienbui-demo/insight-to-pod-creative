# Tight Specs — the 5 drift hotspots

> These are the places an agent WILL invent things if left vague. Each gets a strict spec + a red-test target. Do these before / during implementation, TDD-first.

## G1. Opportunity Score (`spec-scoring.md`)

`opportunityScore` ∈ [0,100], computed at synthesis time from normalized signals:

| Component | Source of signal | Weight (v1, TUNABLE via config) |
|-|-|-|
| Demand | Amazon + Etsy volume/rank | 0.35 |
| Proven-intent | Meta ad longevity/active count | 0.30 |
| Early-culture | TikTok + Reddit + Pinterest + Google Trends slope | 0.25 |
| Competition (inverse) | competitor density / price compression | 0.10 |

- Each component normalized to [0,1] before weighting. Weights live in `scoring.config.ts`, NOT hardcoded in the algorithm.
- `confidence` ∈ [0,1] = (sum of weights of AVAILABLE components) adjusted down when a priority source is missing.
- **Golden-set test:** a fixture of ≥10 hand-scored (input→expected score band) cases. Test asserts computed score falls in the expected band. This is the RED test — write it first.

## G2. Cache hit/miss threshold (`spec-cache.md`)

- Exact match = same (market, seed normalized-lowercased-trimmed, productType) → hit.
- Semantic match = pgvector cosine similarity ≥ `CACHE_SIM_THRESHOLD` (default **0.86**, in config) → hit.
- Below threshold → miss → trigger MA live deep-dive.
- **Test:** near-duplicate seed above threshold returns cached card (no MA call); unrelated seed below threshold triggers miss path. Mock the MA call and assert call-count.

## G3. Adapter `normalize()` per source (`spec-adapters.md`)

- Each source adapter must map provider output → `CanonicalRecord[]` (contract C2) with correct `signalType`.
- Malformed / partial provider output must NOT throw — return best-effort records + log; missing fields become `undefined`, never crash.
- **Test (per adapter):** feed a saved sample provider response fixture → assert normalized records match expected canonical shape. RED test per source before writing the adapter.

## G4. SSE semantic-translator mapping (`spec-sse.md`)

Raw MA event → UiEvent (contract C4):

| MA raw event | UiEvent |
|-|-|
| tool_call crawl(<source>) | `{type:'scanning', source}` |
| reasoning/synthesis chunk | `{type:'synthesizing'}` |
| Seedream image returned | `{type:'image:ready', url}` |
| final card assembled | `{type:'card:ready', card}` |
| tool/loop error | `{type:'error', recoverable}` |
| stream end | `{type:'done'}` |

- **Test:** feed a recorded raw-MA-event fixture stream → assert exact ordered UiEvent output; assert reconnect + dedup-by-id produces no duplicates.

## G5. Degrade-gracefully scenarios (`spec-degrade.md`)

- TikTok (best-effort) down → build card from remaining sources; `missingSources` includes `tiktok`; `confidence` lowered; UI flags it.
- Meta (priority) down → still build, but flag prominently + larger confidence penalty.
- Any single source timeout/error is isolated: caught, logged, excluded — never propagates to fail the whole warehouse build or live scan.
- **Test:** simulate each source throwing → assert a valid TrendCard still returns with correct `missingSources`/`confidence`, and pipeline exit code is success.
