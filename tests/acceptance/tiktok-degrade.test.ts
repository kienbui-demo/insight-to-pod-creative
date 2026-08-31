import { describe, expect, it } from "vitest";

import type { CrawlRequest } from "../../packages/contracts";
import { sourceFailureTurn } from "../../src/agent/__fixtures__/managed-agent-events";
import {
  createInitialCreatorViewState,
  reduceCreatorViewState,
} from "../../src/ui/live-theater/creator-view-state";
import {
  collectUiEvents,
  createC4AcceptanceHarness,
} from "./support/c4-acceptance-harness";

const INPUT = {
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  freshnessTier: "hot" as const,
};

const CRAWL = {
  source: "google_trends",
  market: INPUT.market,
  seed: INPUT.seed,
  productType: INPUT.productType,
  mode: "live",
} satisfies CrawlRequest;

describe("C4 signal 3: TikTok degradation", () => {
  it("lowers confidence relative to an identical complete-source build", async () => {
    const harness = createC4AcceptanceHarness();
    const baseline = await harness.buildCard(INPUT);
    const degraded = await harness.buildCard(INPUT, {
      errors: { tiktok: new Error("TikTok unavailable") },
    });

    expect(degraded.card.missingSources).toEqual(["tiktok"]);
    expect(degraded.card.availableSources).not.toContain("tiktok");
    expect(degraded.card.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(degraded.card.opportunityScore).toBeLessThanOrEqual(100);
    expect(degraded.card.recommendation.action).not.toBe("");
    expect(degraded.card.confidence).toBeLessThan(baseline.card.confidence);
  });

  it("flags TikTok recoverably, returns the partial card, and records degradation", async () => {
    const harness = createC4AcceptanceHarness();
    const tiktokFailure = new Error("TikTok unavailable");
    const degraded = await harness.buildCard(INPUT, {
      errors: { tiktok: tiktokFailure },
    });
    harness.pushManagedEvents(sourceFailureTurn("tiktok", degraded.card));

    const events = await collectUiEvents(
      harness.uiEventSource("run-c4-tiktok-down", {
        kind: "trend-card",
        crawl: CRAWL,
        idempotencyKey: "deep-analysis-c4-tiktok-down",
      }),
    );

    expect(degraded.failures).toEqual([
      { source: "tiktok", error: tiktokFailure },
    ]);
    expect(degraded.transport.calls).toHaveLength(7);
    expect(degraded.recommendation.calls).toHaveLength(1);
    expect(
      degraded.recommendation.calls[0].records.some(
        (record) => record.source === "tiktok",
      ),
    ).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      "error",
      "card:ready",
      "done",
    ]);
    expect(events[0]).toMatchObject({
      type: "error",
      recoverable: true,
      message: expect.stringMatching(/tiktok/i),
    });

    let state = createInitialCreatorViewState();
    for (const event of events) state = reduceCreatorViewState(state, event);
    expect(state.streamStatus).toBe("done");
    expect(state.card).toEqual(degraded.card);
    expect(state.warnings).toEqual([
      expect.stringMatching(/tiktok.*continuing/i),
    ]);
    expect(state.card?.missingSources).toContain("tiktok");
    expect(state.card?.availableSources).not.toContain("tiktok");

    expect(harness.metricSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "tiktok",
            mode: "batch",
            outcome: "failure",
            stage: "execute",
          },
          value: 1,
        },
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "tiktok",
            mode: "live",
            outcome: "failure",
            stage: "final_card",
          },
          value: 1,
        },
        {
          name: "ptv_trend_card_build_total",
          labels: { mode: "batch", outcome: "degraded" },
          value: 1,
        },
        {
          name: "ptv_trend_card_build_total",
          labels: { mode: "live", outcome: "degraded" },
          value: 1,
        },
      ]),
    );
  });
});
