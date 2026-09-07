import { describe, expect, it } from "vitest";

import type {
  CrawlRequest,
  CrawlSource,
  MetricSink,
} from "../../../packages/contracts";
import type {
  BffRequest,
  TrendCardLookupPort,
  TrendCardLookupResult,
} from "../../bff/types";
import {
  COMPLETE_TREND_CARD,
  trendCardMissing,
} from "../__fixtures__/trend-card";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import type { CrawlPortResult, ManagedAgentEvent } from "../ports";
import { warehouseCrawlRecords } from "../warehouse-crawl-records";
import { FakeCrawlPort } from "./support/fake-crawl-port";
import { FakeManagedAgentClient } from "./support/fake-managed-agent-client";
import { FakeSeedreamImagePort } from "./support/fake-seedream-image-port";
import { collectAsync } from "./support/manual-async-stream";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

const LIVE_RESULT = {
  ok: true,
  records: [
    {
      source: "amazon",
      market: "US",
      seed: "retro halloween cats",
      capturedAt: "2026-09-06T00:00:00.000Z",
      signalType: "competition",
      payload: { fromLiveCrawl: true },
    },
  ],
} as const satisfies CrawlPortResult;

class FakeTrendCardLookup implements TrendCardLookupPort {
  readonly calls: CrawlRequest[] = [];

  constructor(private readonly result: TrendCardLookupResult | Error) {}

  async lookup(request: CrawlRequest): Promise<TrendCardLookupResult> {
    this.calls.push(request);
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  }
}

async function fulfillCrawlTool(options: {
  request: BffRequest;
  source: CrawlSource;
  lookup: TrendCardLookupPort;
  crawl?: FakeCrawlPort;
  metricSink?: MetricSink;
}) {
  const client = new FakeManagedAgentClient();
  const crawl = options.crawl ?? new FakeCrawlPort([LIVE_RESULT]);
  const sessions = createModelArkLiveSessionPort({
    client,
    crawl,
    seedream: new FakeSeedreamImagePort(),
    maxImagesPerAction: 1,
    lookup: options.lookup,
    metricSink: options.metricSink,
  });
  const run = await sessions.create(`run-${options.request.kind}`);
  const collected = collectAsync(run.openEvents());
  const toolUseId = `crawl-${options.request.kind}`;

  await run.send(options.request);
  client.session.events.push({
    id: toolUseId,
    type: "agent.custom_tool_use",
    name: "crawl",
    input: { source: options.source },
  });
  client.session.events.push({
    id: `${toolUseId}:required`,
    type: "session.status_idle",
    stop_reason: { type: "requires_action", event_ids: [toolUseId] },
  });
  client.session.events.push({
    id: `${toolUseId}:done`,
    type: "session.status_idle",
    stop_reason: { type: "end_turn" },
  });
  const events = await collected;

  return { client, crawl, events };
}

describe("P9 generate-design warehouse-first crawl fulfillment", () => {
  it("serves a lookup hit to the MA crawl tool without calling the live crawl port", async () => {
    const lookup = new FakeTrendCardLookup({
      kind: "hit",
      card: COMPLETE_TREND_CARD,
    });
    const warehouseModes: string[] = [];
    const metricSink = {
      record(observation) {
        if (
          observation.name === "ptv_crawl_source_run_total" &&
          observation.labels.stage === "execute"
        ) {
          warehouseModes.push(observation.labels.mode);
        }
      },
    } satisfies MetricSink;

    const { client, crawl } = await fulfillCrawlTool({
      request: { kind: "generate-design", crawl: CRAWL },
      source: "amazon",
      lookup,
      metricSink,
    });
    const expected = warehouseCrawlRecords(COMPLETE_TREND_CARD, "amazon");

    expect(lookup.calls).toEqual([CRAWL]);
    expect(crawl.calls).toEqual([]);
    expect(client.session.submittedToolResults).toEqual([
      {
        id: "crawl-generate-design:result",
        type: "user.custom_tool_result",
        custom_tool_use_id: "crawl-generate-design",
        name: "crawl",
        input: { source: "amazon" },
        result: expected,
      } satisfies ManagedAgentEvent,
    ]);
    expect(warehouseModes).toEqual(["warehouse"]);
  });

  it("falls back to the live crawl port when generate-design lookup misses", async () => {
    const lookup = new FakeTrendCardLookup({ kind: "miss" });

    const { client, crawl } = await fulfillCrawlTool({
      request: { kind: "generate-design", crawl: CRAWL },
      source: "amazon",
      lookup,
    });

    expect(lookup.calls).toEqual([CRAWL]);
    expect(crawl.calls).toHaveLength(1);
    expect(client.session.submittedToolResults).toEqual([
      expect.objectContaining({ result: LIVE_RESULT }),
    ]);
  });

  it("synthesizes one warehouse record for an available source and none for a missing source", () => {
    const available = warehouseCrawlRecords(COMPLETE_TREND_CARD, "pinterest");
    const missing = warehouseCrawlRecords(
      trendCardMissing("pinterest"),
      "pinterest",
    );

    expect(available.ok).toBe(true);
    if (!available.ok) {
      throw new Error("expected a successful warehouse crawl result");
    }
    expect(available.records).toHaveLength(1);
    expect(available.records[0]).toEqual(
      expect.objectContaining({
        source: "pinterest",
        market: COMPLETE_TREND_CARD.market,
        seed: COMPLETE_TREND_CARD.seed,
        capturedAt: COMPLETE_TREND_CARD.updatedAt,
        signalType: "culture",
        payload: expect.objectContaining({
          fromWarehouse: true,
          trendSeries: COMPLETE_TREND_CARD.trendSeries,
          referenceImages: COMPLETE_TREND_CARD.referenceImages,
        }),
      }),
    );
    expect(missing).toEqual({ ok: true, records: [] });
  });

  it("keeps trend-card crawl fulfillment live even when a warehouse lookup is provided", async () => {
    const lookup = new FakeTrendCardLookup({
      kind: "hit",
      card: COMPLETE_TREND_CARD,
    });

    const { client, crawl } = await fulfillCrawlTool({
      request: { kind: "trend-card", crawl: CRAWL },
      source: "amazon",
      lookup,
    });

    expect(lookup.calls).toEqual([]);
    expect(crawl.calls).toHaveLength(1);
    expect(client.session.submittedToolResults).toEqual([
      expect.objectContaining({ result: LIVE_RESULT }),
    ]);
  });
});

describe("E1 deep-dive warehouse-first crawl fulfillment", () => {
  it("serves a deep-dive lookup hit to the MA crawl tool without calling the live crawl port", async () => {
    const lookup = new FakeTrendCardLookup({
      kind: "hit",
      card: COMPLETE_TREND_CARD,
    });
    const warehouseModes: string[] = [];
    const metricSink = {
      record(observation) {
        if (
          observation.name === "ptv_crawl_source_run_total" &&
          observation.labels.stage === "execute"
        ) {
          warehouseModes.push(observation.labels.mode);
        }
      },
    } satisfies MetricSink;

    const { client, crawl } = await fulfillCrawlTool({
      request: {
        kind: "deep-dive",
        crawl: CRAWL,
        question: "Which audience should I target?",
      },
      source: "amazon",
      lookup,
      metricSink,
    });
    const expected = warehouseCrawlRecords(COMPLETE_TREND_CARD, "amazon");

    expect(lookup.calls).toEqual([CRAWL]);
    expect(crawl.calls).toEqual([]);
    expect(client.session.submittedToolResults).toEqual([
      {
        id: "crawl-deep-dive:result",
        type: "user.custom_tool_result",
        custom_tool_use_id: "crawl-deep-dive",
        name: "crawl",
        input: { source: "amazon" },
        result: expected,
      } satisfies ManagedAgentEvent,
    ]);
    expect(warehouseModes).toEqual(["warehouse"]);
  });

  it("falls back to the live crawl port when deep-dive lookup misses", async () => {
    const lookup = new FakeTrendCardLookup({ kind: "miss" });

    const { client, crawl } = await fulfillCrawlTool({
      request: {
        kind: "deep-dive",
        crawl: CRAWL,
        question: "Which audience should I target?",
      },
      source: "amazon",
      lookup,
    });

    expect(lookup.calls).toEqual([CRAWL]);
    expect(crawl.calls).toHaveLength(1);
    expect(client.session.submittedToolResults).toEqual([
      expect.objectContaining({ result: LIVE_RESULT }),
    ]);
  });
});

describe("S4b warehouse-served crawl suppresses the scanning UI event", () => {
  it("does not emit a crawl tool_call/scanning event when the warehouse serves the generate-design crawl", async () => {
    const lookup = new FakeTrendCardLookup({
      kind: "hit",
      card: COMPLETE_TREND_CARD,
    });

    const { events } = await fulfillCrawlTool({
      request: { kind: "generate-design", crawl: CRAWL },
      source: "amazon",
      lookup,
    });

    expect(events.some((event) => event.type === "tool_call")).toBe(false);
  });

  it("still emits the crawl scanning event when the generate-design lookup misses", async () => {
    const lookup = new FakeTrendCardLookup({ kind: "miss" });

    const { events } = await fulfillCrawlTool({
      request: { kind: "generate-design", crawl: CRAWL },
      source: "amazon",
      lookup,
    });

    expect(events.some((event) => event.type === "tool_call")).toBe(true);
  });

  it("still emits the crawl scanning event for a trend-card run even when a lookup is provided", async () => {
    const lookup = new FakeTrendCardLookup({
      kind: "hit",
      card: COMPLETE_TREND_CARD,
    });

    const { events } = await fulfillCrawlTool({
      request: { kind: "trend-card", crawl: CRAWL },
      source: "amazon",
      lookup,
    });

    expect(events.some((event) => event.type === "tool_call")).toBe(true);
  });
});
