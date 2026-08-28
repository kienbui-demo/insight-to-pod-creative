import { describe, expect, it, vi } from "vitest";

import type {
  CreditAction,
  CreditDebitRequest,
  CreditDebitResult,
  CrawlRequest,
} from "../../../packages/contracts";
import { CREDIT_COSTS } from "../../../packages/config/credits.config";
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
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

type MeteredBffRequest = BffRequest & { idempotencyKey: string };

function finiteEvents(events: readonly RawMaEvent[]): AsyncIterable<RawMaEvent> {
  return (async function* () {
    yield* events;
  })();
}

class OrderedLookup implements TrendCardLookupPort {
  constructor(
    private readonly result: TrendCardLookupResult,
    private readonly order: string[],
  ) {}

  async lookup(): Promise<TrendCardLookupResult> {
    this.order.push("lookup");
    return this.result;
  }
}

class OrderedLiveRun implements LiveRun {
  readonly sent: BffRequest[] = [];
  seedreamCalls = 0;

  constructor(private readonly order: string[]) {}

  async history(): Promise<readonly RawMaEvent[]> {
    this.order.push("history");
    return [];
  }

  openEvents(): AsyncIterable<RawMaEvent> {
    this.order.push("open");
    return finiteEvents([]);
  }

  async send(request: BffRequest): Promise<void> {
    this.order.push("send");
    this.sent.push(request);
    if (request.kind === "generate-design") {
      // Represents Seedream being reached only through the MA/live boundary.
      this.seedreamCalls += 1;
    }
  }
}

class OrderedLiveSessions implements LiveSessionPort {
  readonly createdRunIds: string[] = [];
  readonly run: OrderedLiveRun;

  constructor(private readonly order: string[]) {
    this.run = new OrderedLiveRun(order);
  }

  async create(runId: string): Promise<LiveRun> {
    this.order.push("session");
    this.createdRunIds.push(runId);
    return this.run;
  }
}

class FakeCreditGate {
  readonly calls: CreditDebitRequest[] = [];

  constructor(
    private readonly order: string[],
    private readonly resultFor: (request: CreditDebitRequest) => CreditDebitResult,
  ) {}

  async debit(request: CreditDebitRequest): Promise<CreditDebitResult> {
    this.order.push(`debit:${request.action}`);
    this.calls.push(request);
    return this.resultFor(request);
  }
}

function applied(request: CreditDebitRequest): CreditDebitResult {
  const cost = CREDIT_COSTS[request.action];
  return {
    ok: true,
    decision: {
      id: `decision-${request.idempotencyKey}`,
      ...request,
      cost,
      status: "applied",
      balanceBefore: 20,
      balanceAfter: 20 - cost,
      decidedAt: "2026-08-28T09:30:00.000Z",
    },
  };
}

function insufficient(
  request: CreditDebitRequest,
  availableCredits = 1,
): CreditDebitResult {
  const cost = CREDIT_COSTS[request.action];
  return {
    ok: false,
    decision: {
      id: `decision-${request.idempotencyKey}`,
      ...request,
      cost,
      status: "rejected",
      balanceBefore: availableCredits,
      balanceAfter: availableCredits,
      decidedAt: "2026-08-28T09:30:00.000Z",
    },
    error: {
      code: "insufficient_credit",
      ...request,
      requiredCredits: cost,
      availableCredits,
    },
  };
}

function meteredRequest(
  kind: BffRequest["kind"],
  idempotencyKey: string,
): MeteredBffRequest {
  if (kind === "deep-dive") {
    return {
      kind,
      crawl: CRAWL,
      question: "Why is this opportunity rising?",
      idempotencyKey,
    };
  }
  return { kind, crawl: CRAWL, idempotencyKey };
}

function webRequest(runId: string, request: MeteredBffRequest): Request {
  return new Request("http://in-memory.test/api/live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runId,
      reconnect: false,
      sellerId: "client-supplied-must-be-ignored",
      request,
    }),
  });
}

function setup(
  lookupResult: TrendCardLookupResult,
  resultFor: (request: CreditDebitRequest) => CreditDebitResult = applied,
) {
  const order: string[] = [];
  const lookup = new OrderedLookup(lookupResult, order);
  const liveSessions = new OrderedLiveSessions(order);
  const credits = new FakeCreditGate(order, resultFor);
  const authenticateSeller = vi.fn(async () => ({ sellerId: "seller-from-session" }));
  const dependencies = {
    lookup,
    liveSessions,
    credits,
    authenticateSeller,
  };
  const post = createLivePostHandler(dependencies);
  return { authenticateSeller, credits, liveSessions, order, post };
}

function expectedDebit(
  runId: string,
  action: CreditAction,
  idempotencyKey: string,
): CreditDebitRequest {
  return {
    sellerId: "seller-from-session",
    runId,
    action,
    idempotencyKey,
  };
}

describe("C7 in-memory live-route credit gate", () => {
  it("serves an exact cache hit without debit or MA session", async () => {
    const { credits, liveSessions, post } = setup({
      kind: "hit",
      card: RECORDED_TREND_CARD,
    });

    const response = await post(
      webRequest("run-hit", meteredRequest("trend-card", "key-hit")),
    );
    await response.text();

    expect(response.status).toBe(200);
    expect(credits.calls).toEqual([]);
    expect(liveSessions.createdRunIds).toEqual([]);
    expect(liveSessions.run.seedreamCalls).toBe(0);
  });

  it("debits deep_analysis after a cache miss and before opening the MA session", async () => {
    const { credits, liveSessions, order, post } = setup({ kind: "miss" });

    const response = await post(
      webRequest("run-miss", meteredRequest("trend-card", "key-miss")),
    );
    await response.text();

    expect(response.status).toBe(200);
    expect(credits.calls).toEqual([
      expectedDebit("run-miss", "deep_analysis", "key-miss"),
    ]);
    expect(order).toEqual([
      "lookup",
      "debit:deep_analysis",
      "session",
      "open",
      "send",
    ]);
    expect(liveSessions.createdRunIds).toEqual(["run-miss"]);
  });

  it("returns HTTP 402 structured C7 JSON on an insufficient cache miss and opens no MA/Seedream", async () => {
    const resultFor = (request: CreditDebitRequest) => insufficient(request);
    const { authenticateSeller, credits, liveSessions, post } = setup(
      { kind: "miss" },
      resultFor,
    );

    const response = await post(
      webRequest(
        "run-insufficient-deep",
        meteredRequest("trend-card", "key-insufficient-deep"),
      ),
    );

    const expected = expectedDebit(
      "run-insufficient-deep",
      "deep_analysis",
      "key-insufficient-deep",
    );
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual(
      (insufficient(expected) as Extract<CreditDebitResult, { decision: { status: "rejected" } }>).error,
    );
    expect(authenticateSeller).toHaveBeenCalledOnce();
    expect(credits.calls).toEqual([expected]);
    expect(liveSessions.createdRunIds).toEqual([]);
    expect(liveSessions.run.seedreamCalls).toBe(0);
  });

  it("returns HTTP 409 structured C7 JSON on an idempotency conflict and opens no MA/Seedream", async () => {
    const conflictFor = (
      request: CreditDebitRequest,
    ): CreditDebitResult => ({
      ok: false,
      error: {
        code: "idempotency_conflict",
        sellerId: request.sellerId,
        idempotencyKey: request.idempotencyKey,
        existingRunId: "run-original",
        requestedRunId: request.runId,
        existingAction: "generate_design",
        requestedAction: request.action,
      },
    });
    const { credits, liveSessions, post } = setup(
      { kind: "miss" },
      conflictFor,
    );

    const response = await post(
      webRequest(
        "run-conflict",
        meteredRequest("trend-card", "key-conflict"),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "idempotency_conflict",
      sellerId: "seller-from-session",
      idempotencyKey: "key-conflict",
      existingRunId: "run-original",
      requestedRunId: "run-conflict",
      existingAction: "generate_design",
      requestedAction: "deep_analysis",
    });
    expect(credits.calls).toEqual([
      expectedDebit("run-conflict", "deep_analysis", "key-conflict"),
    ]);
    expect(liveSessions.createdRunIds).toEqual([]);
    expect(liveSessions.run.sent).toEqual([]);
    expect(liveSessions.run.seedreamCalls).toBe(0);
  });

  it("debits generate_design before opening its MA operation", async () => {
    const { credits, liveSessions, order, post } = setup({ kind: "miss" });

    const response = await post(
      webRequest(
        "run-generate",
        meteredRequest("generate-design", "key-generate"),
      ),
    );
    await response.text();

    expect(credits.calls).toEqual([
      expectedDebit("run-generate", "generate_design", "key-generate"),
    ]);
    expect(order.slice(0, 4)).toEqual([
      "debit:generate_design",
      "session",
      "open",
      "send",
    ]);
    expect(liveSessions.run.seedreamCalls).toBe(1);
  });

  it("returns HTTP 402 for insufficient generate_design and calls no MA/Seedream", async () => {
    const { credits, liveSessions, post } = setup(
      { kind: "miss" },
      (request) => insufficient(request),
    );

    const response = await post(
      webRequest(
        "run-generate-insufficient",
        meteredRequest("generate-design", "key-generate-insufficient"),
      ),
    );

    expect(response.status).toBe(402);
    expect(credits.calls).toEqual([
      expectedDebit(
        "run-generate-insufficient",
        "generate_design",
        "key-generate-insufficient",
      ),
    ]);
    expect(liveSessions.createdRunIds).toEqual([]);
    expect(liveSessions.run.sent).toEqual([]);
    expect(liveSessions.run.seedreamCalls).toBe(0);
  });
});
