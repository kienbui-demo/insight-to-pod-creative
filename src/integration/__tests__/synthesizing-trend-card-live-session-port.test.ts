import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalRecord,
  CrawlSource,
  TrendCard,
} from "../../../packages/contracts";
import { COMPLETE_TREND_CARD } from "../../agent/__fixtures__/trend-card";
import type {
  CrawlPort,
  CrawlPortInput,
  CrawlPortResult,
} from "../../agent/ports";
import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../../bff/types";
import { scoreOpportunity } from "../../scoring/opportunity-score";
import type { EmbeddingProvider } from "../../storage/postgres-trend-card-repository";
import type { TrendCardRepository } from "../../storage/trend-card-repository";
import {
  ALL_CRAWL_SOURCES,
  reduceOpportunityComponents,
} from "../../warehouse/component-reducer";
import type {
  Clock,
  RecommendationContext,
  RecommendationPort,
} from "../../warehouse/types";
import { createPersistingTrendCardSessionPort } from "../persisting-trend-card-live-session-port";
import { createRescoringLiveSessionPort } from "../rescoring-live-session-port";
import { createSynthesizingTrendCardLiveSessionPort } from "../synthesizing-trend-card-live-session-port";

const FIXED_NOW = "2026-09-09T12:00:00.000Z";

const TREND_CARD_REQUEST = {
  kind: "trend-card",
  crawl: {
    source: "google_trends",
    market: "US",
    seed: "halloween cats",
    productType: "t-shirt",
    window: { from: "2026-08-01", to: "2026-09-09" },
    limit: 20,
    mode: "live",
  },
} satisfies BffRequest;

const NON_CARD_EVENTS = [
  { id: "thinking-1", type: "synthesis_chunk", note: "Researching" },
  {
    id: "crawl-1",
    type: "tool_call",
    tool: "crawl",
    source: "google_trends",
  },
  {
    id: "answer-1",
    type: "agent_message",
    text: "The agent returned markdown instead of a card.",
  },
] satisfies readonly RawMaEvent[];

function canonicalRecord(
  source: CrawlSource,
  signalType: CanonicalRecord["signalType"],
  normalizedValue: number,
  payload: Record<string, unknown> = {},
): CanonicalRecord {
  return {
    source,
    market: TREND_CARD_REQUEST.crawl.market,
    seed: TREND_CARD_REQUEST.crawl.seed,
    capturedAt: FIXED_NOW,
    signalType,
    payload: { normalizedValue, ...payload },
  };
}

const RECORDS_BY_SOURCE: Readonly<
  Record<CrawlSource, readonly CanonicalRecord[]>
> = {
  google_trends: [
    canonicalRecord("google_trends", "culture", 0.88, {
      trendSeries: [
        { t: "2026-08-01", v: 42 },
        { t: "2026-08-15", v: 68 },
        { t: "2026-09-01", v: 91 },
      ],
    }),
  ],
  reddit: [canonicalRecord("reddit", "culture", 0.82)],
  pinterest: [
    canonicalRecord("pinterest", "culture", 0.8, {
      referenceImageUrls: [
        "https://assets.example.test/halloween-cat-reference.webp",
      ],
    }),
  ],
  tiktok: [canonicalRecord("tiktok", "culture", 0.86)],
  amazon: [
    canonicalRecord("amazon", "demand", 0.9, {
      competitors: [
        { title: "Retro Cat Tee", price: 24.99, adActive: true },
      ],
    }),
    canonicalRecord("amazon", "competition", 0.78),
  ],
  etsy: [
    canonicalRecord("etsy", "demand", 0.84, {
      competitors: [
        { title: "Vintage Halloween Cat Shirt", price: 21.5 },
      ],
    }),
    canonicalRecord("etsy", "price", 0.76),
  ],
  meta_ads: [canonicalRecord("meta_ads", "ad", 0.92)],
};

type CrawlBehavior = (
  input: CrawlPortInput,
) => CrawlPortResult | Promise<CrawlPortResult>;

class FakeCrawlPort implements CrawlPort {
  readonly calls: CrawlPortInput[] = [];

  constructor(
    private readonly behavior: CrawlBehavior = async ({ source }) => ({
      ok: true,
      records: RECORDS_BY_SOURCE[source],
    }),
  ) {}

  async fetch(input: CrawlPortInput): Promise<CrawlPortResult> {
    this.calls.push(input);
    return await this.behavior(input);
  }
}

class FixedClock implements Clock {
  nowIso(): string {
    return FIXED_NOW;
  }
}

class FakeRecommendation implements RecommendationPort {
  readonly calls: RecommendationContext[] = [];

  constructor(
    private readonly result: TrendCard["recommendation"] = {
      action: "Test the Halloween cat concept.",
      reasoning: "The collected evidence supports a focused test.",
    },
    private readonly error?: Error,
  ) {}

  async recommend(
    context: RecommendationContext,
  ): Promise<TrendCard["recommendation"]> {
    this.calls.push(context);
    if (this.error !== undefined) {
      throw this.error;
    }
    return this.result;
  }
}

class FakeLiveRun implements LiveRun {
  readonly historyResult: readonly RawMaEvent[] = [
    { id: "history-1", type: "synthesis_chunk", note: "Earlier" },
  ];
  readonly history = vi.fn(async () => this.historyResult);
  readonly sent: BffRequest[] = [];
  readonly signals: Array<AbortSignal | undefined> = [];
  readonly cancelledWith: unknown[] = [];

  constructor(private readonly events: readonly RawMaEvent[]) {}

  async *openEvents(signal?: AbortSignal): AsyncIterable<RawMaEvent> {
    this.signals.push(signal);
    if (signal?.aborted) {
      return;
    }
    for (const event of this.events) {
      if (signal?.aborted) {
        return;
      }
      yield event;
    }
  }

  async send(request: BffRequest): Promise<void> {
    this.sent.push(request);
  }

  cancel(reason?: unknown): void {
    this.cancelledWith.push(reason);
  }
}

class FakeLiveSessionPort implements LiveSessionPort {
  readonly runIds: string[] = [];

  constructor(readonly run: FakeLiveRun) {}

  async create(runId: string): Promise<LiveRun> {
    this.runIds.push(runId);
    return this.run;
  }
}

type SaveCall = Parameters<TrendCardRepository["save"]>;

class FakeTrendCardRepository {
  readonly saved: SaveCall[] = [];

  async save(...call: SaveCall): Promise<void> {
    this.saved.push(call);
  }
}

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly seeds: string[] = [];

  constructor(private readonly embedding: readonly number[] = [0.2, 0.8]) {}

  async embed(seed: string): Promise<readonly number[]> {
    this.seeds.push(seed);
    return this.embedding;
  }
}

async function collect(events: AsyncIterable<RawMaEvent>) {
  const collected: RawMaEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function createSubject(
  events: readonly RawMaEvent[],
  options: {
    crawl?: FakeCrawlPort;
    clock?: Clock;
    recommendation?: RecommendationPort;
  } = {},
) {
  const innerRun = new FakeLiveRun(events);
  const inner = new FakeLiveSessionPort(innerRun);
  const crawl = options.crawl ?? new FakeCrawlPort();
  const port = createSynthesizingTrendCardLiveSessionPort({
    inner,
    crawl,
    clock: options.clock ?? new FixedClock(),
    recommendation: options.recommendation,
  });

  return { crawl, inner, innerRun, port };
}

describe("createSynthesizingTrendCardLiveSessionPort", () => {
  it("synthesizes a final_card after a trend-card stream ends naturally without one", async () => {
    const { port } = createSubject(NON_CARD_EVENTS);
    const run = await port.create("run-natural-end");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded.slice(0, NON_CARD_EVENTS.length)).toEqual(NON_CARD_EVENTS);
    NON_CARD_EVENTS.forEach((event, index) =>
      expect(yielded[index]).toBe(event),
    );
    expect(yielded.at(-1)).toMatchObject({
      id: "run-natural-end:repo-synthesized-final-card",
      type: "final_card",
    });
    expect(yielded).toHaveLength(NON_CARD_EVENTS.length + 1);
  });

  it("builds a complete warehouse TrendCard from all crawl sources", async () => {
    let callsStarted = 0;
    const callCountsAtSettlement: number[] = [];
    const crawl = new FakeCrawlPort(
      ({ source }) =>
        new Promise<CrawlPortResult>((resolve) => {
          callsStarted += 1;
          queueMicrotask(() => {
            callCountsAtSettlement.push(callsStarted);
            resolve({ ok: true, records: RECORDS_BY_SOURCE[source] });
          });
        }),
    );
    const { port } = createSubject([], { crawl });
    const run = await port.create("run-complete-card");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());
    const finalEvent = yielded.find((event) => event.type === "final_card");

    expect(finalEvent?.type).toBe("final_card");
    if (finalEvent?.type !== "final_card") {
      return;
    }

    const records = ALL_CRAWL_SOURCES.flatMap(
      (source) => RECORDS_BY_SOURCE[source],
    );
    const reduction = reduceOpportunityComponents(records);
    const scoring = scoreOpportunity({
      components: reduction.components,
      availableSources: [...ALL_CRAWL_SOURCES],
      missingSources: [],
    });

    expect(finalEvent.id).toBe(
      "run-complete-card:repo-synthesized-final-card",
    );
    expect(finalEvent.card).toMatchObject({
      market: "US",
      seed: "halloween cats",
      productType: "t-shirt",
      ...scoring,
      availableSources: ALL_CRAWL_SOURCES,
      missingSources: [],
      trendSeries: [
        { t: "2026-08-01", v: 42 },
        { t: "2026-08-15", v: 68 },
        { t: "2026-09-01", v: 91 },
      ],
      referenceImages: [
        "https://assets.example.test/halloween-cat-reference.webp",
      ],
      competitors: [
        { title: "Retro Cat Tee", price: 24.99, adActive: true },
        { title: "Vintage Halloween Cat Shirt", price: 21.5 },
      ],
      recommendation: {
        action: 'Act now: test "halloween cats" on t-shirt in US.',
        reasoning:
          "87/100 opportunity with 100% confidence from 7/7 tracked sources; no tracked sources are missing.",
      },
      freshnessTier: "hot",
      updatedAt: FIXED_NOW,
    });
    expect(finalEvent.card.id).toMatch(/^trend_[a-f0-9]{64}$/);
    expect(callCountsAtSettlement[0]).toBe(ALL_CRAWL_SOURCES.length);
    expect(crawl.calls).toEqual(
      ALL_CRAWL_SOURCES.map((source) => ({
        source,
        market: "US",
        seed: "halloween cats",
        productType: "t-shirt",
        window: { from: "2026-08-01", to: "2026-09-09" },
        limit: 20,
      })),
    );
  });

  it("persists the synthetic card through rescoring and trend-card persistence", async () => {
    const crawl = new FakeCrawlPort();
    const innerRun = new FakeLiveRun(NON_CARD_EVENTS);
    const raw = new FakeLiveSessionPort(innerRun);
    const synthesized = createSynthesizingTrendCardLiveSessionPort({
      inner: raw,
      crawl,
      clock: new FixedClock(),
    });
    const rescored = createRescoringLiveSessionPort({
      inner: synthesized,
      crawl,
    });
    const repository = new FakeTrendCardRepository();
    const embeddings = new FakeEmbeddingProvider([0.4, 0.6]);
    const persisted = createPersistingTrendCardSessionPort({
      inner: rescored,
      repository,
      embeddings,
    });
    const run = await persisted.create("run-persisted");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());
    const finalEvent = yielded.find((event) => event.type === "final_card");

    expect(finalEvent?.type).toBe("final_card");
    if (finalEvent?.type !== "final_card") {
      return;
    }
    expect(repository.saved).toEqual([
      [finalEvent.card, [0.4, 0.6]],
    ]);
    expect(embeddings.seeds).toEqual(["halloween cats"]);
    expect(crawl.calls).toHaveLength(ALL_CRAWL_SOURCES.length);
  });

  it("does not add a synthetic card when a real final_card is present", async () => {
    const realFinalCard = {
      id: "agent-final-card",
      type: "final_card",
      card: COMPLETE_TREND_CARD,
    } satisfies RawMaEvent;
    const events = [...NON_CARD_EVENTS, realFinalCard];
    const { crawl, port } = createSubject(events);
    const run = await port.create("run-real-card");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual(events);
    events.forEach((event, index) => expect(yielded[index]).toBe(event));
    expect(yielded.filter((event) => event.type === "final_card")).toEqual([
      realFinalCard,
    ]);
    expect(crawl.calls).toHaveLength(0);
  });

  it.each([
    {
      name: "generate-design",
      request: {
        kind: "generate-design",
        crawl: TREND_CARD_REQUEST.crawl,
      } satisfies BffRequest,
    },
    {
      name: "deep-dive",
      request: {
        kind: "deep-dive",
        crawl: TREND_CARD_REQUEST.crawl,
        question: "What should I test first?",
      } satisfies BffRequest,
    },
  ])("passes through $name streams without synthesis", async ({ request }) => {
    const { crawl, port } = createSubject(NON_CARD_EVENTS);
    const run = await port.create(`run-${request.kind}`);

    await run.send(request);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual(NON_CARD_EVENTS);
    NON_CARD_EVENTS.forEach((event, index) =>
      expect(yielded[index]).toBe(event),
    );
    expect(crawl.calls).toHaveLength(0);
  });

  it("keeps synthesis failures best-effort and preserves all MA events", async () => {
    const recommendationError = new Error("recommendation unavailable");
    const recommendation = new FakeRecommendation(
      undefined,
      recommendationError,
    );
    const { port } = createSubject(NON_CARD_EVENTS, { recommendation });
    const run = await port.create("run-failed-synthesis");

    await run.send(TREND_CARD_REQUEST);

    await expect(collect(run.openEvents())).resolves.toEqual(NON_CARD_EVENTS);
  });

  it("delegates run operations and does not synthesize an aborted stream", async () => {
    const { crawl, inner, innerRun, port } = createSubject(NON_CARD_EVENTS);
    const controller = new AbortController();
    const reason = new Error("seller cancelled");
    controller.abort(reason);

    const run = await port.create("run-delegated");
    const history = await run.history();
    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents(controller.signal));
    await run.cancel?.(reason);

    expect(inner.runIds).toEqual(["run-delegated"]);
    expect(history).toBe(innerRun.historyResult);
    expect(innerRun.history).toHaveBeenCalledOnce();
    expect(innerRun.sent).toEqual([TREND_CARD_REQUEST]);
    expect(innerRun.signals).toEqual([controller.signal]);
    expect(innerRun.cancelledWith).toEqual([reason]);
    expect(yielded).toEqual([]);
    expect(crawl.calls).toHaveLength(0);
  });
});
