import { describe, expect, it } from "vitest";

import type { CrawlRequest, TrendCard, UiEvent } from "../../../packages/contracts";
import { RECORDED_TREND_CARD } from "../../bff/__fixtures__/raw-ma-events";
import {
  ControllableAsyncEvents,
  readOneFrame,
  readRemaining,
} from "../../bff/__tests__/support/async-events";
import {
  FakeLiveRun,
  FakeLiveSessionPort,
  FakeTrendCardLookup,
} from "../../bff/__tests__/support/fake-bff-ports";
import type { BffRequest, RawMaEvent } from "../../bff/types";
import { createLivePostHandler } from "../live-route";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

function finiteEvents(events: readonly RawMaEvent[]): AsyncIterable<RawMaEvent> {
  return (async function* () {
    yield* events;
  })();
}

function liveRequest(
  runId: string,
  reconnect = false,
  request: BffRequest = { kind: "trend-card", crawl: CRAWL },
): Request {
  return new Request("http://in-memory.test/api/live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId, reconnect, request }),
  });
}

async function responseEvents(response: Response): Promise<UiEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!data) {
        throw new Error(`Missing SSE data line in ${frame}`);
      }
      return JSON.parse(data.slice("data: ".length)) as UiEvent;
    });
}

describe("C1 in-memory live Next route", () => {
  it("returns the required SSE streaming and no-cache headers", async () => {
    const run = new FakeLiveRun([], finiteEvents([]));
    const post = createLivePostHandler({
      lookup: new FakeTrendCardLookup({
        kind: "hit",
        card: RECORDED_TREND_CARD,
      }),
      liveSessions: new FakeLiveSessionPort(run),
    });

    const response = await post(liveRequest("run-headers"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("connection")).toBe("keep-alive");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  it("delivers one SSE frame before the upstream iterable completes", async () => {
    const live = new ControllableAsyncEvents<RawMaEvent>();
    const run = new FakeLiveRun([], live);
    const post = createLivePostHandler({
      lookup: new FakeTrendCardLookup({ kind: "miss" }),
      liveSessions: new FakeLiveSessionPort(run),
    });
    const response = await post(liveRequest("run-incremental"));
    const reader = response.body!.getReader();

    live.push({
      id: "scan-before-complete",
      type: "tool_call",
      tool: "crawl",
      source: "reddit",
    });

    await expect(readOneFrame(reader)).resolves.toContain("event: scanning\n");
    expect(run.order.slice(0, 2)).toEqual(["open", "send"]);

    live.end();
    await expect(readRemaining(reader)).resolves.toContain("event: done\n");
  });

  it("opens the MA stream before sending the user event", async () => {
    const run = new FakeLiveRun([], finiteEvents([]));
    const sessions = new FakeLiveSessionPort(run);
    const post = createLivePostHandler({
      lookup: new FakeTrendCardLookup({ kind: "miss" }),
      liveSessions: sessions,
    });

    const response = await post(liveRequest("run-order"));
    await response.text();

    expect(run.order.slice(0, 2)).toEqual(["open", "send"]);
    expect(sessions.createdRunIds).toEqual(["run-order"]);
  });

  it("emits card:ready then done for an exact hit without opening MA", async () => {
    const run = new FakeLiveRun([], finiteEvents([]));
    const sessions = new FakeLiveSessionPort(run);
    const post = createLivePostHandler({
      lookup: new FakeTrendCardLookup({
        kind: "hit",
        card: RECORDED_TREND_CARD,
      }),
      liveSessions: sessions,
    });

    const events = await responseEvents(
      await post(liveRequest("run-exact-cache-hit")),
    );

    expect(events).toEqual([
      {
        id: "run-exact-cache-hit:card",
        type: "card:ready",
        card: RECORDED_TREND_CARD,
      },
      { id: "run-exact-cache-hit:done", type: "done" },
    ] satisfies UiEvent[]);
    expect(sessions.createdRunIds).toEqual([]);
    expect(run.order).toEqual([]);
  });

  it("replays history, resumes live events, and deduplicates event ids on reconnect", async () => {
    const repeated: RawMaEvent = {
      id: "history-1",
      type: "synthesis_chunk",
      note: "Already observed",
    };
    const run = new FakeLiveRun(
      [repeated],
      finiteEvents([
        repeated,
        {
          id: "live-2",
          type: "tool_call",
          tool: "crawl",
          source: "meta_ads",
        },
      ]),
    );
    const post = createLivePostHandler({
      lookup: new FakeTrendCardLookup({ kind: "miss" }),
      liveSessions: new FakeLiveSessionPort(run),
    });

    const events = await responseEvents(
      await post(liveRequest("run-reconnect", true)),
    );

    expect(events.map((event) => event.id)).toEqual([
      "history-1",
      "live-2",
      "run-reconnect:done",
    ]);
    expect(events.filter((event) => event.id === "history-1")).toHaveLength(1);
    expect(run.order).toEqual(["history", "open"]);
    expect(run.sent).toEqual([]);
  });

  it("keeps a recoverable source error visible and completes with a partial card", async () => {
    const partialCard: TrendCard = {
      ...RECORDED_TREND_CARD,
      confidence: 0.61,
      availableSources: ["google_trends", "reddit", "meta_ads"],
      missingSources: ["tiktok"],
    };
    const run = new FakeLiveRun(
      [],
      finiteEvents([
        {
          id: "tiktok-error",
          type: "error",
          recoverable: true,
          message: "TikTok unavailable; continuing with remaining sources",
        },
        { id: "partial-card", type: "final_card", card: partialCard },
      ]),
    );
    const post = createLivePostHandler({
      lookup: new FakeTrendCardLookup({ kind: "miss" }),
      liveSessions: new FakeLiveSessionPort(run),
    });

    const events = await responseEvents(
      await post(liveRequest("run-degraded")),
    );

    expect(events).toEqual([
      {
        id: "tiktok-error",
        type: "error",
        recoverable: true,
        message: "TikTok unavailable; continuing with remaining sources",
      },
      { id: "partial-card", type: "card:ready", card: partialCard },
      { id: "run-degraded:done", type: "done" },
    ] satisfies UiEvent[]);
    expect(partialCard.missingSources).toContain("tiktok");
    expect(partialCard.confidence).toBeLessThan(RECORDED_TREND_CARD.confidence);
  });

  it("emits one fatal error and closes without done or later events", async () => {
    const run = new FakeLiveRun(
      [],
      finiteEvents([
        {
          id: "fatal-session-error",
          type: "error",
          recoverable: false,
          message: "MA session terminated",
        },
        { id: "must-not-appear", type: "synthesis_chunk" },
      ]),
    );
    const post = createLivePostHandler({
      lookup: new FakeTrendCardLookup({ kind: "miss" }),
      liveSessions: new FakeLiveSessionPort(run),
    });

    const events = await responseEvents(await post(liveRequest("run-fatal")));

    expect(events).toEqual([
      {
        id: "fatal-session-error",
        type: "error",
        recoverable: false,
        message: "MA session terminated",
      },
    ] satisfies UiEvent[]);
  });
});
