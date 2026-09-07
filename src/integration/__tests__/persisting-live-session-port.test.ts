import { describe, expect, it, vi } from "vitest";

import type { SellerProject } from "../../../packages/contracts";
import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../../bff/types";
import type { SellerProjectRepository } from "../../storage/seller-project-repository";
import { createPersistingLiveSessionPort } from "../persisting-live-session-port";

const GENERATE_DESIGN_REQUEST = {
  kind: "generate-design",
  crawl: {
    source: "google_trends",
    market: "US",
    seed: "retro halloween cats",
    productType: "t-shirt",
    mode: "live",
  },
} satisfies BffRequest;

const TREND_CARD_REQUEST = {
  kind: "trend-card",
  crawl: GENERATE_DESIGN_REQUEST.crawl,
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

class FakeSellerProjectRepository implements SellerProjectRepository {
  readonly saved: SellerProject[] = [];

  async save(project: SellerProject): Promise<void> {
    this.saved.push(project);
  }

  async findById(): Promise<SellerProject | null> {
    return null;
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
  projects: SellerProjectRepository = new FakeSellerProjectRepository(),
) {
  const innerRun = new FakeLiveRun(events);
  const inner = new FakeLiveSessionPort(innerRun);
  const port = createPersistingLiveSessionPort({
    inner,
    projects,
    sellerId: "seller-123",
  });

  return { inner, innerRun, port, projects };
}

describe("createPersistingLiveSessionPort", () => {
  it("saves the first generated design and passes every event through unchanged", async () => {
    const events = [
      { id: "event-1", type: "synthesis_chunk", note: "Designing" },
      {
        id: "event-2",
        type: "seedream_image",
        url: "https://assets.example.test/design.png",
      },
      { id: "event-3", type: "agent_message", text: "Ready" },
    ] satisfies readonly RawMaEvent[];
    const projects = new FakeSellerProjectRepository();
    const { port } = createSubject(events, projects);
    const run = await port.create("run-123");

    await run.send(GENERATE_DESIGN_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual(events);
    expect(yielded[0]).toBe(events[0]);
    expect(yielded[1]).toBe(events[1]);
    expect(yielded[2]).toBe(events[2]);
    expect(projects.saved).toHaveLength(1);
    expect(projects.saved[0]).toEqual({
      id: "run-123",
      sellerId: "seller-123",
      market: "US",
      seed: "retro halloween cats",
      productType: "t-shirt",
      designAssetUrl: "https://assets.example.test/design.png",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("does not save images emitted for a trend-card request", async () => {
    const image = {
      id: "event-1",
      type: "seedream_image",
      url: "https://assets.example.test/reference.png",
    } satisfies RawMaEvent;
    const projects = new FakeSellerProjectRepository();
    const { port } = createSubject([image], projects);
    const run = await port.create("run-trend");

    await run.send(TREND_CARD_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual([image]);
    expect(yielded[0]).toBe(image);
    expect(projects.saved).toHaveLength(0);
  });

  it("saves at most once when a generate-design run emits multiple images", async () => {
    const events = [
      {
        id: "image-1",
        type: "seedream_image",
        url: "https://assets.example.test/first.png",
      },
      {
        id: "image-2",
        type: "seedream_image",
        url: "https://assets.example.test/second.png",
      },
    ] satisfies readonly RawMaEvent[];
    const projects = new FakeSellerProjectRepository();
    const { port } = createSubject(events, projects);
    const run = await port.create("run-multiple");

    await run.send(GENERATE_DESIGN_REQUEST);
    const yielded = await collect(run.openEvents());

    expect(yielded).toEqual(events);
    expect(projects.saved).toHaveLength(1);
    expect(projects.saved[0]?.designAssetUrl).toBe(
      "https://assets.example.test/first.png",
    );
  });

  it("continues yielding all events when persistence fails", async () => {
    const events = [
      {
        id: "image-1",
        type: "seedream_image",
        url: "https://assets.example.test/failed-save.png",
      },
      { id: "event-2", type: "agent_message", text: "Still streaming" },
    ] satisfies readonly RawMaEvent[];
    const projects: SellerProjectRepository = {
      save: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
      findById: vi.fn(async () => null),
    };
    const { port } = createSubject(events, projects);
    const run = await port.create("run-failed-save");

    await run.send(GENERATE_DESIGN_REQUEST);

    await expect(collect(run.openEvents())).resolves.toEqual(events);
    expect(projects.save).toHaveBeenCalledOnce();
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
