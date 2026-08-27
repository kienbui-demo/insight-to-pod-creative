import { describe, expect, it } from "vitest";

import type { UiEvent } from "../../../packages/contracts";
import {
  EXPECTED_TRANSLATED_EVENTS,
  RECORDED_RAW_MA_EVENTS,
  RECORDED_TREND_CARD,
} from "../__fixtures__/raw-ma-events";
import type { RawMaEvent } from "../types";
import {
  translateRawMaEvent,
  translateRawMaEvents,
} from "../sse-translator";

describe("G4 semantic SSE translator", () => {
  it("maps a recorded raw MA stream to the exact ordered C4 events", () => {
    expect(translateRawMaEvents(RECORDED_RAW_MA_EVENTS)).toEqual(
      EXPECTED_TRANSLATED_EVENTS,
    );
  });

  it.each<[RawMaEvent, UiEvent]>([
    [
      { id: "scan", type: "tool_call", tool: "crawl", source: "tiktok" },
      { id: "scan", type: "scanning", source: "tiktok" },
    ],
    [
      { id: "think", type: "synthesis_chunk" },
      { id: "think", type: "synthesizing" },
    ],
    [
      { id: "image", type: "seedream_image", url: "https://tos/img.png" },
      { id: "image", type: "image:ready", url: "https://tos/img.png" },
    ],
    [
      { id: "card", type: "final_card", card: RECORDED_TREND_CARD },
      { id: "card", type: "card:ready", card: RECORDED_TREND_CARD },
    ],
    [
      {
        id: "retryable",
        type: "error",
        recoverable: true,
        message: "TikTok timed out",
      },
      {
        id: "retryable",
        type: "error",
        recoverable: true,
        message: "TikTok timed out",
      },
    ],
    [
      {
        id: "fatal",
        type: "error",
        recoverable: false,
        message: "Session terminated",
      },
      {
        id: "fatal",
        type: "error",
        recoverable: false,
        message: "Session terminated",
      },
    ],
  ])("maps %# without changing the event id", (raw, expected) => {
    expect(translateRawMaEvent(raw)).toEqual(expected);
  });

  it("does not expose an unmapped MA lifecycle or span event", () => {
    expect(
      translateRawMaEvent({
        id: "span-1",
        type: "unmapped",
        name: "span.model_request_start",
      }),
    ).toBeUndefined();
  });

  it("drops duplicate ids without reordering the first occurrences", () => {
    const duplicated = [
      RECORDED_RAW_MA_EVENTS[0],
      RECORDED_RAW_MA_EVENTS[2],
      RECORDED_RAW_MA_EVENTS[0],
      RECORDED_RAW_MA_EVENTS[3],
    ];

    expect(translateRawMaEvents(duplicated)).toEqual([
      EXPECTED_TRANSLATED_EVENTS[0],
      EXPECTED_TRANSLATED_EVENTS[1],
      EXPECTED_TRANSLATED_EVENTS[2],
    ]);
  });
});
