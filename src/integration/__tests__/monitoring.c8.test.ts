import { describe, expect, it } from "vitest";

import type {
  CreditDebitRequest,
  CreditDebitResult,
  CrawlRequest,
} from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import { RECORDED_TREND_CARD } from "../../bff/__fixtures__/raw-ma-events";
import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
  TrendCardLookupPort,
  TrendCardLookupResult,
} from "../../bff/types";
import { createLivePostHandler } from "../live-route";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  mode: "live",
} satisfies CrawlRequest;

type MeteredRequest = BffRequest & { idempotencyKey: string };

function finiteEvents(): AsyncIterable<RawMaEvent> {
  return (async function* () {})();
}

class FakeLookup implements TrendCardLookupPort {
  constructor(private readonly result: TrendCardLookupResult) {}
  async lookup(): Promise<TrendCardLookupResult> {
    return this.result;
  }
}

class FakeRun implements LiveRun {
  readonly sent: BffRequest[] = [];
  async history(): Promise<readonly RawMaEvent[]> {
    return [];
  }
  openEvents(): AsyncIterable<RawMaEvent> {
    return finiteEvents();
  }
  async send(request: BffRequest): Promise<void> {
    this.sent.push(request);
  }
}

class FakeSessions implements LiveSessionPort {
  readonly runIds: string[] = [];
  readonly run = new FakeRun();
  async create(runId: string): Promise<LiveRun> {
    this.runIds.push(runId);
    return this.run;
  }
}

class FakeCredits {
  readonly calls: CreditDebitRequest[] = [];
  constructor(private readonly result: (request: CreditDebitRequest) => CreditDebitResult) {}
  async debit(request: CreditDebitRequest): Promise<CreditDebitResult> {
    this.calls.push(request);
    return this.result(request);
  }
}

function applied(request: CreditDebitRequest): CreditDebitResult {
  return {
    ok: true,
    decision: {
      id: `decision-${request.idempotencyKey}`,
      ...request,
      cost: 2,
      status: "applied",
      balanceBefore: 20,
      balanceAfter: 18,
      decidedAt: "2026-08-28T10:00:00.000Z",
    },
  };
}

function insufficient(request: CreditDebitRequest): CreditDebitResult {
  return {
    ok: false,
    decision: {
      id: `decision-${request.idempotencyKey}`,
      ...request,
      cost: 2,
      status: "rejected",
      balanceBefore: 1,
      balanceAfter: 1,
      decidedAt: "2026-08-28T10:00:00.000Z",
    },
    error: {
      code: "insufficient_credit",
      ...request,
      requiredCredits: 2,
      availableCredits: 1,
    },
  };
}

function conflict(request: CreditDebitRequest): CreditDebitResult {
  return {
    ok: false,
    error: {
      code: "idempotency_conflict",
      sellerId: request.sellerId,
      idempotencyKey: request.idempotencyKey,
      existingRunId: "original-run",
      requestedRunId: request.runId,
      existingAction: "generate_design",
      requestedAction: request.action,
    },
  };
}

function request(runId: string, bffRequest: MeteredRequest): Request {
  return new Request("http://in-memory.test/api/live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId, reconnect: false, request: bffRequest }),
  });
}

function setup(
  lookup: TrendCardLookupResult,
  creditResult: (request: CreditDebitRequest) => CreditDebitResult = applied,
) {
  const metricSink = new InMemoryMetricSink();
  const liveSessions = new FakeSessions();
  const credits = new FakeCredits(creditResult);
  const post = createLivePostHandler({
    lookup: new FakeLookup(lookup),
    liveSessions,
    credits,
    authenticateSeller: async () => ({ sellerId: "seller-session" }),
    metricSink,
  });
  return { credits, liveSessions, metricSink, post };
}

describe("live-route C8 monitoring", () => {
  it("records cache-hit success without opening MA or recording MA infrastructure", async () => {
    const { liveSessions, metricSink, post } = setup({
      kind: "hit",
      card: RECORDED_TREND_CARD,
    });
    const response = await post(
      request("cache-run", {
        kind: "trend-card",
        crawl: CRAWL,
        idempotencyKey: "cache-key",
      }),
    );
    await response.text();

    expect(response.status).toBe(200);
    expect(liveSessions.runIds).toEqual([]);
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_live_request_total",
      labels: {
        requestKind: "trend_card",
        deliveryPath: "cache_hit",
        outcome: "success",
      },
      value: 1,
    });
    expect(
      metricSink.snapshot().counters.some(
        (entry) => entry.name === "ptv_infra_operation_total",
      ),
    ).toBe(false);
  });

  it("records managed-agent dispatch for an allowed generation", async () => {
    const { liveSessions, metricSink, post } = setup({ kind: "miss" });
    const response = await post(
      request("generate-run", {
        kind: "generate-design",
        crawl: CRAWL,
        idempotencyKey: "generate-key",
      }),
    );
    await response.text();

    expect(liveSessions.runIds).toEqual(["generate-run"]);
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_live_request_total",
      labels: {
        requestKind: "generate_design",
        deliveryPath: "managed_agent",
        outcome: "success",
      },
      value: 1,
    });
  });

  it.each([
    { name: "credit_rejected" as const, result: insufficient, status: 402 },
    { name: "credit_conflict" as const, result: conflict, status: 409 },
  ])("records $name without opening MA", async ({ name, result, status }) => {
    const { liveSessions, metricSink, post } = setup({ kind: "miss" }, result);
    const response = await post(
      request(`${name}-run`, {
        kind: "trend-card",
        crawl: CRAWL,
        idempotencyKey: `${name}-key`,
      }),
    );

    expect(response.status).toBe(status);
    expect(liveSessions.runIds).toEqual([]);
    expect(metricSink.snapshot().counters).toContainEqual({
      name: "ptv_live_request_total",
      labels: {
        requestKind: "trend_card",
        deliveryPath: name,
        outcome: "error",
      },
      value: 1,
    });
  });
});
