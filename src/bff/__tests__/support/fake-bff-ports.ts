import { vi } from "vitest";

import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
  TrendCardLookupPort,
  TrendCardLookupResult,
} from "../../types";

export class FakeTrendCardLookup implements TrendCardLookupPort {
  readonly calls: BffRequest["crawl"][] = [];

  constructor(private readonly result: TrendCardLookupResult) {}

  async lookup(request: BffRequest["crawl"]): Promise<TrendCardLookupResult> {
    this.calls.push(request);
    return this.result;
  }
}

export class FakeLiveRun implements LiveRun {
  readonly order: string[] = [];
  readonly sent: BffRequest[] = [];
  readonly cancel = vi.fn(async () => undefined);

  constructor(
    private readonly historicalEvents: readonly RawMaEvent[],
    private readonly liveEvents: AsyncIterable<RawMaEvent>,
  ) {}

  async history(): Promise<readonly RawMaEvent[]> {
    this.order.push("history");
    return this.historicalEvents;
  }

  openEvents(): AsyncIterable<RawMaEvent> {
    this.order.push("open");
    return this.liveEvents;
  }

  async send(request: BffRequest): Promise<void> {
    this.order.push("send");
    this.sent.push(request);
  }
}

export class FakeLiveSessionPort implements LiveSessionPort {
  readonly createdRunIds: string[] = [];

  constructor(readonly run: FakeLiveRun) {}

  async create(runId: string): Promise<LiveRun> {
    this.createdRunIds.push(runId);
    return this.run;
  }
}
