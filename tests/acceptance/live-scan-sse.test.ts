import { describe, expect, it } from "vitest";

import { CACHE_SIM_THRESHOLD } from "../../packages/config/cache.config";
import type { CrawlRequest } from "../../packages/contracts";
import { COMPLETE_TREND_CARD } from "../../src/agent/__fixtures__/trend-card";
import {
  createInitialCreatorViewState,
  reduceCreatorViewState,
} from "../../src/ui/live-theater/creator-view-state";
import {
  collectUiEvents,
  createC4AcceptanceHarness,
  responseUiEvents,
} from "./support/c4-acceptance-harness";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "brand new halloween constellation",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

describe("C4 signal 2: cache-miss live scan", () => {
  it("opens before send and exposes scanning, synthesizing, and a usable card in order", async () => {
    const harness = createC4AcceptanceHarness({
      cache: {
        similar: {
          card: COMPLETE_TREND_CARD,
          similarity: CACHE_SIM_THRESHOLD - 0.01,
        },
      },
    });
    const { card } = await harness.buildCard({
      market: CRAWL.market,
      seed: CRAWL.seed,
      productType: CRAWL.productType,
      freshnessTier: "hot",
    });
    harness.pushManagedEvents([
      {
        id: "live-scan-1",
        type: "agent.custom_tool_use",
        name: "crawl",
        input: { source: "google_trends" },
      },
      {
        id: "live-scan-2",
        type: "agent.thinking",
        note: "Synthesizing cross-source demand and competition.",
      },
      {
        id: "live-scan-3",
        type: "agent.output",
        output: { kind: "trend_card", card },
      },
      {
        id: "live-scan-idle",
        type: "session.status_idle",
        stop_reason: { type: "end_turn" },
      },
    ]);

    const events = await collectUiEvents(
      harness.uiEventSource("run-c4-live-scan", {
        kind: "trend-card",
        crawl: CRAWL,
        idempotencyKey: "deep-analysis-c4-live-scan",
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "scanning",
      "synthesizing",
      "card:ready",
      "done",
    ]);
    expect(harness.managedAgentSession.order.slice(0, 2)).toEqual([
      "open",
      "send",
    ]);
    expect(harness.managedAgentClient.attachedRunIds).toEqual([
      "run-c4-live-scan",
    ]);
    expect(harness.cacheRepository.findExactCalls).toEqual([
      {
        market: "US",
        seed: "brand new halloween constellation",
        productType: "t-shirt",
      },
    ]);
    expect(harness.cacheRepository.findSimilarCalls).toEqual(
      harness.cacheRepository.findExactCalls,
    );

    let viewState = createInitialCreatorViewState();
    const stages = events.map((event) => {
      viewState = reduceCreatorViewState(viewState, event);
      return viewState.stage;
    });
    expect(stages).toEqual([
      "scanning",
      "synthesizing",
      "card-ready",
      "card-ready",
    ]);
    expect(viewState.streamStatus).toBe("done");
    expect(viewState.card).toEqual(card);
    expect(card.id).toMatch(/^trend_[a-f0-9]{64}$/);
    expect(card.market).toBe(CRAWL.market);
    expect(card.seed).toBe(CRAWL.seed);
    expect(card.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(card.opportunityScore).toBeLessThanOrEqual(100);
    expect(card.confidence).toBeGreaterThanOrEqual(0);
    expect(card.confidence).toBeLessThanOrEqual(1);
    expect(card.recommendation.action).not.toBe("");
    expect(card.recommendation.reasoning).not.toBe("");

    expect(harness.metricSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_live_request_total",
          labels: {
            requestKind: "trend_card",
            deliveryPath: "managed_agent",
            outcome: "success",
          },
          value: 1,
        },
        {
          name: "ptv_sse_stream_total",
          labels: { outcome: "done" },
          value: 1,
        },
      ]),
    );
  });

  it("replays history, does not resend, and deduplicates a repeated event.id", async () => {
    const repeated = {
      id: "reconnect-repeat",
      type: "agent.thinking",
      note: "Already visible before transport interruption.",
    } as const;
    const harness = createC4AcceptanceHarness({ history: [repeated] });
    harness.pushManagedEvents([
      repeated,
      {
        id: "reconnect-live",
        type: "agent.custom_tool_use",
        name: "crawl",
        input: { source: "reddit" },
      },
      {
        id: "reconnect-idle",
        type: "session.status_idle",
        stop_reason: { type: "end_turn" },
      },
    ]);
    const request = {
      kind: "trend-card" as const,
      crawl: CRAWL,
      idempotencyKey: "deep-analysis-c4-reconnect",
    };

    const events = await responseUiEvents(
      await harness.post(
        harness.liveRequest("run-c4-reconnect", request, true),
      ),
    );

    expect(events.map((event) => event.id)).toEqual([
      "reconnect-repeat",
      "reconnect-live",
      "run-c4-reconnect:done",
    ]);
    expect(
      events.filter((event) => event.id === "reconnect-repeat"),
    ).toHaveLength(1);
    expect(harness.managedAgentSession.order).toEqual(["open", "history"]);
    expect(harness.managedAgentSession.sent).toEqual([]);
    expect(harness.managedAgentClient.attachedRunIds).toEqual([
      "run-c4-reconnect",
    ]);
    expect(harness.metricSink.snapshot().counters).toContainEqual({
      name: "ptv_sse_event_total",
      labels: { eventType: "synthesizing", disposition: "deduplicated" },
      value: 1,
    });
  });
});
