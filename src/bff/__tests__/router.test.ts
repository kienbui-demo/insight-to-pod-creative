import { describe, expect, it } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import { RECORDED_TREND_CARD } from "../__fixtures__/raw-ma-events";
import type { BffRequest } from "../types";
import { handleBffRequest } from "../router";
import { ControllableAsyncEvents } from "./support/async-events";
import {
  FakeLiveRun,
  FakeLiveSessionPort,
  FakeTrendCardLookup,
} from "./support/fake-bff-ports";

const CRAWL: CrawlRequest = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
};

function harness(lookupResult: ConstructorParameters<typeof FakeTrendCardLookup>[0]) {
  const liveEvents = new ControllableAsyncEvents<never>();
  const run = new FakeLiveRun([], liveEvents);
  return {
    dependencies: {
      lookup: new FakeTrendCardLookup(lookupResult),
      liveSessions: new FakeLiveSessionPort(run),
    },
    run,
    liveEvents,
  };
}

describe("framework-neutral BFF router", () => {
  it("returns a cached trend card without creating an MA session", async () => {
    const test = harness({ kind: "hit", card: RECORDED_TREND_CARD });

    const result = await handleBffRequest(
      { kind: "trend-card", crawl: CRAWL },
      { runId: "fast-run", reconnect: false },
      test.dependencies,
    );

    expect(result).toEqual({ kind: "card", card: RECORDED_TREND_CARD });
    expect(test.dependencies.lookup.calls).toEqual([CRAWL]);
    expect(test.dependencies.liveSessions.createdRunIds).toEqual([]);
  });

  it("opens the live event stream before sending a cache-miss request", async () => {
    const test = harness({ kind: "miss" });

    const result = await handleBffRequest(
      { kind: "trend-card", crawl: CRAWL },
      { runId: "miss-run", reconnect: false },
      test.dependencies,
    );

    expect(result.kind).toBe("stream");
    expect(test.run.order.slice(0, 2)).toEqual(["open", "send"]);
    expect(test.run.sent).toEqual([{ kind: "trend-card", crawl: CRAWL }]);
    expect(test.dependencies.liveSessions.createdRunIds).toEqual(["miss-run"]);
  });

  it.each<BffRequest>([
    { kind: "generate-design", crawl: CRAWL },
    { kind: "deep-dive", crawl: CRAWL, question: "Why is this rising?" },
  ])("uses the slow path for $kind without consulting cache", async (request) => {
    const test = harness({ kind: "hit", card: RECORDED_TREND_CARD });

    const result = await handleBffRequest(
      request,
      { runId: `run-${request.kind}`, reconnect: false },
      test.dependencies,
    );

    expect(result.kind).toBe("stream");
    expect(test.dependencies.lookup.calls).toEqual([]);
    expect(test.run.order.slice(0, 2)).toEqual(["open", "send"]);
    expect(test.run.sent).toEqual([request]);
  });

  it("loads history before opening live events on reconnect, then sends nothing", async () => {
    const test = harness({ kind: "miss" });

    const result = await handleBffRequest(
      { kind: "trend-card", crawl: CRAWL },
      { runId: "reconnect-run", reconnect: true },
      test.dependencies,
    );

    expect(result.kind).toBe("stream");
    expect(test.run.order).toEqual(["history", "open"]);
    expect(test.run.sent).toEqual([]);
  });
});
