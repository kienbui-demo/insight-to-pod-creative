import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalRecord,
  CrawlSource,
  TrendCard,
} from "../../../packages/contracts";
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
import {
  ALL_CRAWL_SOURCES,
  reduceOpportunityComponents,
} from "../../warehouse/component-reducer";
import { createRescoringLiveSessionPort } from "../rescoring-live-session-port";

const TREND_CARD_REQUEST = {
  kind: "trend-card",
  crawl: {
    source: "google_trends",
    market: "US",
    seed: "halloween cats",
    productType: "t-shirt",
    mode: "live",
  },
} satisfies BffRequest;

const GENERATE_DESIGN_REQUEST = {
  kind: "generate-design",
  crawl: TREND_CARD_REQUEST.crawl,
} satisfies BffRequest;

const SINGLE_SOURCE_CARD = {
  id: "trend-halloween-cats",
  market: "US",
  seed: "halloween cats",
  productType: "t-shirt",
  opportunityScore: 10,
  confidence: 0.1,
  availableSources: ["google_trends"],
  missingSources: [
    "reddit",
    "pinterest",
    "tiktok",
    "amazon",
    "etsy",
    "meta_ads",
  ],
  trendSeries: [{ t: "2026-09-01", v: 72 }],
  referenceImages: [],
  recommendation: {
    action: "Test a Halloween cat design.",
    reasoning: "Google Trends shows early interest.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-09-09T00:00:00.000Z",
} satisfies TrendCard;

function canonicalRecord(
  source: CrawlSource,
  signalType: CanonicalRecord["signalType"],
  normalizedValue: number,
): CanonicalRecord {
  return {
    source,
    market: SINGLE_SOURCE_CARD.market,
    seed: SINGLE_SOURCE_CARD.seed,
    capturedAt: "2026-09-09T00:00:00.000Z",
    signalType,
    payload: { normalizedValue },
  };
}

const RECORDS_BY_SOURCE: Readonly<
  Record<CrawlSource, readonly CanonicalRecord[]>
> = {
  google_trends: [canonicalRecord("google_trends", "culture", 0.88)],
  reddit: [canonicalRecord("reddit", "culture", 0.82)],
  pinterest: [canonicalRecord("pinterest", "culture", 0.8)],
  tiktok: [canonicalRecord("tiktok", "culture", 0.86)],
  amazon: [
    canonicalRecord("amazon", "demand", 0.9),
    canonicalRecord("amazon", "competition", 0.78),
  ],
  etsy: [
    canonicalRecord("etsy", "demand", 0.84),
    canonicalRecord("etsy", "price", 0.76),
  ],
  meta_ads: [canonicalRecord("meta_ads", "ad", 0.92)],
};

type CrawlBehavior = (
  input: CrawlPortInput,
) => CrawlPortResult | Promise<CrawlPortResult>;

class FakeCrawlPort implements CrawlPort {
  readonly calls: CrawlPortInput[] = [];

  constructor(private readonly behavior: CrawlBehavior) {}

  async fetch(input: CrawlPortInput): Promise<CrawlPortResult> {
    this.calls.push(input);
    return await this.behavior(input);
  }
}

class FakeLiveRun implements LiveRun {
  readonly historyResult: readonly RawMaEvent[] = [];
  readonly history = vi.fn(async () => this.historyResult);
  readonly sent: BffRequest[] = [];
  readonly cancelledWith: unknown[] = [];

  constructor(private readonly events: readonly RawMaEvent[]) {}

  async *openEvents(): AsyncIterable<RawMaEvent> {
    for (const event of this.events) {
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

async function collect(events: AsyncIterable<RawMaEvent>) {
  const collected: RawMaEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function createSubject(
  events: readonly RawMaEvent[],
  crawl: CrawlPort,
) {
  const innerRun = new FakeLiveRun(events);
  const inner = new FakeLiveSessionPort(innerRun);
  const port = createRescoringLiveSessionPort({ inner, crawl });

  return { inner, innerRun, port };
}

function successfulCrawl(): FakeCrawlPort {
  return new FakeCrawlPort(async ({ source }) => ({
    ok: true,
    records: RECORDS_BY_SOURCE[source],
  }));
}

describe("createRescoringLiveSessionPort", () => {
  it("rescores a trend-card final_card from multi-source crawl", async () => {
    const finalCard = {
      id: "card-1",
      type: "final_card",
      card: SINGLE_SOURCE_CARD,
    } satisfies RawMaEvent;
    const callCountsAtSettlement: number[] = [];
    let callsStarted = 0;
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
    const { port } = createSubject([finalCard], crawl);
    const run = await port.create("run-trend-card");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    const allRecords = ALL_CRAWL_SOURCES.flatMap(
      (source) => RECORDS_BY_SOURCE[source],
    );
    const reduction = reduceOpportunityComponents(allRecords);
    const contributing = new Set(reduction.contributingSources);
    const availableSources = ALL_CRAWL_SOURCES.filter((source) =>
      contributing.has(source),
    );
    const missingSources = ALL_CRAWL_SOURCES.filter(
      (source) => !contributing.has(source),
    );
    const expectedScoring = scoreOpportunity({
      components: reduction.components,
      availableSources,
      missingSources,
    });
    const rescoredEvent = yielded[0];
    expect(rescoredEvent?.type).toBe("final_card");
    if (rescoredEvent?.type !== "final_card") {
      throw new Error("Expected a final_card event");
    }

    expect(rescoredEvent.card.availableSources).toEqual(availableSources);
    expect(rescoredEvent.card.missingSources).toEqual(missingSources);
    expect({
      opportunityScore: rescoredEvent.card.opportunityScore,
      confidence: rescoredEvent.card.confidence,
    }).toEqual(expectedScoring);
    expect(rescoredEvent.card.opportunityScore).toBeGreaterThan(10);
    expect(callCountsAtSettlement[0]).toBe(ALL_CRAWL_SOURCES.length);
    expect(crawl.calls).toEqual(
      ALL_CRAWL_SOURCES.map((source) => ({
        source,
        market: SINGLE_SOURCE_CARD.market,
        seed: SINGLE_SOURCE_CARD.seed,
        productType: SINGLE_SOURCE_CARD.productType,
      })),
    );
  });

  it("passes through non-trend-card runs untouched", async () => {
    const finalCard = {
      id: "card-design",
      type: "final_card",
      card: SINGLE_SOURCE_CARD,
    } satisfies RawMaEvent;
    const crawl = successfulCrawl();
    const { port } = createSubject([finalCard], crawl);
    const run = await port.create("run-design");

    await run.send(GENERATE_DESIGN_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual([finalCard]);
    expect(yielded[0]).toBe(finalCard);
    expect(crawl.calls).toHaveLength(0);
  });

  it("keeps the original card when no records contribute", async () => {
    const finalCard = {
      id: "card-empty",
      type: "final_card",
      card: SINGLE_SOURCE_CARD,
    } satisfies RawMaEvent;
    const crawl = new FakeCrawlPort(async () => ({
      ok: true,
      records: [],
    }));
    const { port } = createSubject([finalCard], crawl);
    const run = await port.create("run-empty");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual([finalCard]);
    expect(yielded[0]).toBe(finalCard);
    expect(SINGLE_SOURCE_CARD.opportunityScore).toBe(10);
    expect(SINGLE_SOURCE_CARD.availableSources).toEqual(["google_trends"]);
  });

  it("keeps the original card when every crawl source fails", async () => {
    const finalCard = {
      id: "card-failed",
      type: "final_card",
      card: SINGLE_SOURCE_CARD,
    } satisfies RawMaEvent;
    const crawl = new FakeCrawlPort(async ({ source }) => {
      const sourceIndex = ALL_CRAWL_SOURCES.indexOf(source);
      if (sourceIndex % 2 === 0) {
        throw new Error(`${source} unavailable`);
      }
      return {
        ok: false,
        recoverable: true,
        message: `${source} returned no data`,
      };
    });
    const { port } = createSubject([finalCard], crawl);
    const run = await port.create("run-failed");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual([finalCard]);
    expect(yielded[0]).toBe(finalCard);
  });

  it("rescores only the first final_card and preserves event order", async () => {
    const firstCard = {
      id: "card-first",
      type: "final_card",
      card: SINGLE_SOURCE_CARD,
    } satisfies RawMaEvent;
    const secondCard = {
      id: "card-second",
      type: "final_card",
      card: { ...SINGLE_SOURCE_CARD, id: "trend-second" },
    } satisfies RawMaEvent;
    const events = [
      { id: "synthesis-1", type: "synthesis_chunk", note: "Combining" },
      firstCard,
      { id: "answer-1", type: "agent_message", text: "Card ready" },
      { id: "unmapped-1", type: "unmapped", name: "session.status_idle" },
      secondCard,
    ] satisfies readonly RawMaEvent[];
    const crawl = successfulCrawl();
    const { port } = createSubject(events, crawl);
    const run = await port.create("run-multiple-cards");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded.map((event) => event.id)).toEqual(
      events.map((event) => event.id),
    );
    expect(yielded[0]).toBe(events[0]);
    expect(yielded[2]).toBe(events[2]);
    expect(yielded[3]).toBe(events[3]);
    expect(yielded[1]).not.toBe(firstCard);
    expect(yielded[4]).toBe(secondCard);
    expect(crawl.calls).toHaveLength(ALL_CRAWL_SOURCES.length);
  });
});
