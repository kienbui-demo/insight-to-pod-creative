import { describe, expect, it, vi } from "vitest";

import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../../bff/types";
import { COMPLETE_TREND_CARD } from "../../agent/__fixtures__/trend-card";
import type { EmbeddingProvider } from "../../storage/postgres-trend-card-repository";
import type { TrendCardRepository } from "../../storage/trend-card-repository";
import { createPersistingTrendCardSessionPort } from "../persisting-trend-card-live-session-port";

const TREND_CARD_REQUEST = {
  kind: "trend-card",
  crawl: {
    source: "google_trends",
    market: "US",
    seed: "retro halloween cats",
    productType: "t-shirt",
    mode: "live",
  },
} satisfies BffRequest;

const GENERATE_DESIGN_REQUEST = {
  kind: "generate-design",
  crawl: TREND_CARD_REQUEST.crawl,
} satisfies BffRequest;

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

type SaveCall = Parameters<TrendCardRepository["save"]>;

class FakeTrendCardRepository {
  readonly saved: SaveCall[] = [];

  async save(...call: SaveCall): Promise<void> {
    this.saved.push(call);
  }
}

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly seeds: string[] = [];

  constructor(
    private readonly embedding: readonly number[] = [0.1, 0.2, 0.3],
    private readonly error?: Error,
  ) {}

  async embed(seed: string): Promise<readonly number[]> {
    this.seeds.push(seed);
    if (this.error) {
      throw this.error;
    }
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
  repository: Pick<TrendCardRepository, "save"> =
    new FakeTrendCardRepository(),
  embeddings: EmbeddingProvider = new FakeEmbeddingProvider(),
) {
  const innerRun = new FakeLiveRun(events);
  const inner = new FakeLiveSessionPort(innerRun);
  const port = createPersistingTrendCardSessionPort({
    inner,
    repository,
    embeddings,
  });

  return { embeddings, inner, innerRun, port, repository };
}

describe("createPersistingTrendCardSessionPort", () => {
  it("embeds and saves a trend-card final_card while preserving event identity", async () => {
    const events = [
      { id: "event-1", type: "synthesis_chunk", note: "Synthesizing" },
      { id: "event-2", type: "final_card", card: COMPLETE_TREND_CARD },
      { id: "event-3", type: "agent_message", text: "Ready" },
    ] satisfies readonly RawMaEvent[];
    const repository = new FakeTrendCardRepository();
    const embeddings = new FakeEmbeddingProvider([0.4, 0.5]);
    const { port } = createSubject(events, repository, embeddings);
    const run = await port.create("run-trend-card");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual(events);
    events.forEach((event, index) => expect(yielded[index]).toBe(event));
    expect(embeddings.seeds).toEqual([
      COMPLETE_TREND_CARD.seed.trim().toLowerCase(),
    ]);
    expect(repository.saved).toEqual([
      [COMPLETE_TREND_CARD, [0.4, 0.5]],
    ]);
  });

  it("ignores final_card events for other request kinds and images for trend-card runs", async () => {
    const finalCard = {
      id: "card-1",
      type: "final_card",
      card: COMPLETE_TREND_CARD,
    } satisfies RawMaEvent;
    const image = {
      id: "image-1",
      type: "seedream_image",
      url: "https://assets.example.test/reference.png",
    } satisfies RawMaEvent;
    const repository = new FakeTrendCardRepository();
    const first = createSubject([finalCard], repository);
    const second = createSubject([image], repository);

    const designRun = await first.port.create("run-design");
    await designRun.send(GENERATE_DESIGN_REQUEST);
    await expect(collect(designRun.openEvents())).resolves.toEqual([finalCard]);

    const trendRun = await second.port.create("run-trend-image");
    await trendRun.send(TREND_CARD_REQUEST);
    await expect(collect(trendRun.openEvents())).resolves.toEqual([image]);

    expect(repository.saved).toHaveLength(0);
  });

  it("saves at most once when a trend-card run emits multiple final_card events", async () => {
    const events = [
      { id: "card-1", type: "final_card", card: COMPLETE_TREND_CARD },
      {
        id: "card-2",
        type: "final_card",
        card: { ...COMPLETE_TREND_CARD, id: "second-card" },
      },
    ] satisfies readonly RawMaEvent[];
    const repository = new FakeTrendCardRepository();
    const { port } = createSubject(events, repository);
    const run = await port.create("run-multiple");

    await run.send(TREND_CARD_REQUEST);
    await expect(collect(run.openEvents())).resolves.toEqual(events);

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.[0]).toBe(COMPLETE_TREND_CARD);
  });

  it("continues yielding and attempts an undefined-embedding save when persistence fails", async () => {
    const events = [
      { id: "card-1", type: "final_card", card: COMPLETE_TREND_CARD },
      { id: "event-2", type: "agent_message", text: "Still streaming" },
    ] satisfies readonly RawMaEvent[];
    const save = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    const embeddings = new FakeEmbeddingProvider(
      [],
      new Error("embedding unavailable"),
    );
    const { port } = createSubject(events, { save }, embeddings);
    const run = await port.create("run-failed-persistence");

    await run.send(TREND_CARD_REQUEST);

    await expect(collect(run.openEvents())).resolves.toEqual(events);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(COMPLETE_TREND_CARD, undefined);
  });

  it("delegates create, history, openEvents, send, and cancel to the inner run", async () => {
    const event = {
      id: "event-1",
      type: "agent_message",
      text: "Delegated",
    } satisfies RawMaEvent;
    const { inner, innerRun, port } = createSubject([event]);
    const signal = new AbortController().signal;
    const reason = new Error("cancelled");

    const run = await port.create("run-delegated");
    const history = await run.history();
    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents(signal));
    await run.cancel?.(reason);

    expect(inner.runIds).toEqual(["run-delegated"]);
    expect(history).toBe(innerRun.historyResult);
    expect(innerRun.history).toHaveBeenCalledOnce();
    expect(innerRun.sent).toEqual([TREND_CARD_REQUEST]);
    expect(innerRun.signals).toEqual([signal]);
    expect(innerRun.cancelledWith).toEqual([reason]);
    expect(yielded).toEqual([event]);
    expect(yielded[0]).toBe(event);
  });
});
