import { describe, expect, it } from "vitest";

import type {
  CrawlSource,
  TrendCard,
  UiEvent,
} from "../../../packages/contracts";
import {
  createInitialCreatorViewState,
  reduceCreatorViewState,
  type CreatorViewState,
} from "./creator-view-state";

const TREND_CARD = {
  id: "trend-retro-halloween-cats",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  opportunityScore: 84,
  confidence: 0.91,
  availableSources: ["reddit", "amazon", "meta_ads"],
  missingSources: ["tiktok"],
  trendSeries: [
    { t: "2026-08-13", v: 61 },
    { t: "2026-08-20", v: 72 },
    { t: "2026-08-27", v: 85 },
  ],
  referenceImages: ["https://tos.example/reference.png"],
  competitors: [
    { title: "Retro Halloween Cat Shirt", price: 24.99, adActive: true },
  ],
  recommendation: {
    action: "Create a retro Halloween cat design.",
    reasoning: "Demand is accelerating while competition remains moderate.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-08-28T02:00:00.000Z",
} satisfies TrendCard;

const SCANNING_EVENT = {
  id: "event-1",
  type: "scanning",
  source: "reddit",
} satisfies UiEvent;

const SYNTHESIZING_EVENT = {
  id: "event-2",
  type: "synthesizing",
  note: "Comparing demand and competition",
} satisfies UiEvent;

const IMAGE_READY_EVENT = {
  id: "event-3",
  type: "image:ready",
  url: "https://tos.example/generated.png",
} satisfies UiEvent;

const CARD_READY_EVENT = {
  id: "event-4",
  type: "card:ready",
  card: TREND_CARD,
} satisfies UiEvent;

const RECOVERABLE_ERROR_EVENT = {
  id: "event-5",
  type: "error",
  recoverable: true,
  message: "TikTok is temporarily unavailable",
} satisfies UiEvent;

const FATAL_ERROR_EVENT = {
  id: "event-6",
  type: "error",
  recoverable: false,
  message: "The live analysis stopped unexpectedly",
} satisfies UiEvent;

const DONE_EVENT = {
  id: "event-7",
  type: "done",
} satisfies UiEvent;

function reduceEvents(events: readonly UiEvent[]): CreatorViewState {
  return events.reduce(
    reduceCreatorViewState,
    createInitialCreatorViewState(),
  );
}

describe("reduceCreatorViewState", () => {
  it("maps scanning events to active scan progress without duplicating sources", () => {
    const firstState: CreatorViewState = reduceCreatorViewState(
      createInitialCreatorViewState(),
      SCANNING_EVENT,
    );
    const secondScan = {
      id: "event-1b",
      type: "scanning",
      source: "reddit",
    } satisfies UiEvent;
    const secondState: CreatorViewState = reduceCreatorViewState(
      firstState,
      secondScan,
    );

    expect(firstState.streamStatus).toBe("active");
    expect(firstState.stage).toBe("scanning");
    expect(secondState.scannedSources).toEqual(["reddit"] satisfies CrawlSource[]);
  });

  it("maps synthesizing, image:ready, and card:ready events while accumulating progress", () => {
    const state: CreatorViewState = reduceEvents([
      SCANNING_EVENT,
      SYNTHESIZING_EVENT,
      IMAGE_READY_EVENT,
      CARD_READY_EVENT,
    ]);

    expect(state.streamStatus).toBe("active");
    expect(state.stage).toBe("card-ready");
    expect(state.scannedSources).toEqual(["reddit"]);
    expect(state.synthesisNote).toBe("Comparing demand and competition");
    expect(state.imageUrls).toEqual(["https://tos.example/generated.png"]);
    expect(state.card).toEqual(TREND_CARD);
  });

  it("maps done to a terminal completed stream while preserving the last activity", () => {
    const state: CreatorViewState = reduceEvents([
      SCANNING_EVENT,
      SYNTHESIZING_EVENT,
      DONE_EVENT,
    ]);

    expect(state.streamStatus).toBe("done");
    expect(state.stage).toBe("synthesizing");
    expect(state.synthesisNote).toBe("Comparing demand and competition");
  });

  it("produces the expected accumulated state for the ordered happy-path stream", () => {
    const state: CreatorViewState = reduceEvents([
      SCANNING_EVENT,
      SYNTHESIZING_EVENT,
      IMAGE_READY_EVENT,
      CARD_READY_EVENT,
      DONE_EVENT,
    ]);
    const expected: CreatorViewState = {
      streamStatus: "done",
      stage: "card-ready",
      scannedSources: ["reddit"],
      synthesisNote: "Comparing demand and competition",
      imageUrls: ["https://tos.example/generated.png"],
      card: TREND_CARD,
      warnings: [],
      seenEventIds: ["event-1", "event-2", "event-3", "event-4", "event-7"],
    };

    expect(state).toEqual(expected);
  });

  it("deduplicates replayed events by id without changing the existing state", () => {
    const state: CreatorViewState = reduceCreatorViewState(
      createInitialCreatorViewState(),
      SCANNING_EVENT,
    );
    const replayWithDifferentPayload = {
      id: SCANNING_EVENT.id,
      type: "synthesizing",
      note: "This replay must be ignored",
    } satisfies UiEvent;

    const replayedState: CreatorViewState = reduceCreatorViewState(
      state,
      replayWithDifferentPayload,
    );

    expect(replayedState).toBe(state);
  });

  it("appends a recoverable warning while preserving card, images, and stage", () => {
    const completedProgress: CreatorViewState = reduceEvents([
      IMAGE_READY_EVENT,
      CARD_READY_EVENT,
    ]);
    const warnedState: CreatorViewState = reduceCreatorViewState(
      completedProgress,
      RECOVERABLE_ERROR_EVENT,
    );

    expect(warnedState.streamStatus).toBe("active");
    expect(warnedState.stage).toBe("card-ready");
    expect(warnedState.card).toBe(TREND_CARD);
    expect(warnedState.imageUrls).toEqual(completedProgress.imageUrls);
    expect(warnedState.warnings).toEqual([RECOVERABLE_ERROR_EVENT.message]);
  });

  it("marks an unrecoverable error as failed while retaining completed progress", () => {
    const completedProgress: CreatorViewState = reduceEvents([
      SCANNING_EVENT,
      IMAGE_READY_EVENT,
      CARD_READY_EVENT,
    ]);
    const failedState: CreatorViewState = reduceCreatorViewState(
      completedProgress,
      FATAL_ERROR_EVENT,
    );

    expect(failedState.streamStatus).toBe("failed");
    expect(failedState.fatalError).toBe(FATAL_ERROR_EVENT.message);
    expect(failedState.stage).toBe("card-ready");
    expect(failedState.scannedSources).toEqual(completedProgress.scannedSources);
    expect(failedState.imageUrls).toEqual(completedProgress.imageUrls);
    expect(failedState.card).toBe(TREND_CARD);
  });

  it("ignores events arriving after done", () => {
    const doneState: CreatorViewState = reduceEvents([
      SCANNING_EVENT,
      DONE_EVENT,
    ]);

    const stateAfterLateEvent: CreatorViewState = reduceCreatorViewState(
      doneState,
      CARD_READY_EVENT,
    );

    expect(stateAfterLateEvent).toBe(doneState);
  });

  it("ignores events arriving after an unrecoverable error", () => {
    const failedState: CreatorViewState = reduceEvents([
      SCANNING_EVENT,
      FATAL_ERROR_EVENT,
    ]);

    const stateAfterLateEvent: CreatorViewState = reduceCreatorViewState(
      failedState,
      CARD_READY_EVENT,
    );

    expect(stateAfterLateEvent).toBe(failedState);
  });
});
