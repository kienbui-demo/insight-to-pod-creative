import { describe, expect, it, vi } from "vitest";

import type {
  CreditBalance,
  CreditDebitRequest,
  CreditDebitResult,
  MetricSink,
} from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import {
  createCreditService,
  type CreditRepository,
} from "../credit-service";

const REQUEST: CreditDebitRequest = {
  sellerId: "seller-monitoring",
  runId: "run-monitoring",
  action: "generate_design",
  idempotencyKey: "key-monitoring",
};

function applied(): CreditDebitResult {
  return {
    ok: true,
    decision: {
      id: "decision-monitoring",
      ...REQUEST,
      cost: 5,
      status: "applied",
      balanceBefore: 20,
      balanceAfter: 15,
      decidedAt: "2026-08-28T10:00:00.000Z",
    },
  };
}

function rejected(): CreditDebitResult {
  return {
    ok: false,
    decision: {
      id: "decision-rejected",
      ...REQUEST,
      cost: 5,
      status: "rejected",
      balanceBefore: 1,
      balanceAfter: 1,
      decidedAt: "2026-08-28T10:00:00.000Z",
    },
    error: {
      code: "insufficient_credit",
      ...REQUEST,
      requiredCredits: 5,
      availableCredits: 1,
    },
  };
}

function conflict(): CreditDebitResult {
  return {
    ok: false,
    error: {
      code: "idempotency_conflict",
      sellerId: REQUEST.sellerId,
      idempotencyKey: REQUEST.idempotencyKey,
      existingRunId: "another-run",
      requestedRunId: REQUEST.runId,
      existingAction: "deep_analysis",
      requestedAction: REQUEST.action,
    },
  };
}

class ScriptedCreditRepository implements CreditRepository {
  readonly refundFailedOperation = vi.fn(async () => undefined);
  readonly markOperationSucceeded = vi.fn(async () => undefined);

  constructor(
    private readonly result: CreditDebitResult,
    private readonly claim = true,
  ) {}

  async ensureAccount(sellerId: string): Promise<CreditBalance> {
    return {
      sellerId,
      availableCredits: 20,
      version: 1,
      updatedAt: "2026-08-28T10:00:00.000Z",
    };
  }

  async debit(): Promise<CreditDebitResult> {
    return this.result;
  }

  async claimOperation(): Promise<boolean> {
    return this.claim;
  }
}

function service(
  repository: CreditRepository,
  metricSink: MetricSink,
) {
  return createCreditService({
    repository,
    costs: { generate_design: 5, deep_analysis: 2 },
    seedCredits: 20,
    metricSink,
  });
}

describe("credit-service C8 monitoring", () => {
  it("records applied decisions and debit volume once across canonical replays", async () => {
    const metricSink = new InMemoryMetricSink();
    const creditService = service(
      new ScriptedCreditRepository(applied()),
      metricSink,
    );

    await creditService.debit(REQUEST);
    await creditService.debit(REQUEST);

    expect(metricSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_credit_decision_total",
          labels: { action: "generate_design", outcome: "applied" },
          value: 1,
        },
        {
          name: "ptv_credits_debited_total",
          labels: { action: "generate_design" },
          value: 5,
        },
      ]),
    );
  });

  it("records rejected/conflict decisions without adding credit volume", async () => {
    for (const [result, outcome] of [
      [rejected(), "rejected"],
      [conflict(), "conflict"],
    ] as const) {
      const metricSink = new InMemoryMetricSink();
      await service(new ScriptedCreditRepository(result), metricSink).debit(REQUEST);

      expect(metricSink.snapshot().counters).toContainEqual({
        name: "ptv_credit_decision_total",
        labels: { action: "generate_design", outcome },
        value: 1,
      });
      expect(
        metricSink.snapshot().counters.some(
          (entry) => entry.name === "ptv_credits_debited_total",
        ),
      ).toBe(false);
    }
  });

  it("records succeeded, failed-refunded, and replay-not-started metered outcomes", async () => {
    const succeededSink = new InMemoryMetricSink();
    await service(
      new ScriptedCreditRepository(applied()),
      succeededSink,
    ).runMetered(REQUEST, async () => "ok");
    expect(succeededSink.snapshot().counters).toContainEqual({
      name: "ptv_metered_operation_total",
      labels: { action: "generate_design", outcome: "succeeded" },
      value: 1,
    });

    const failedSink = new InMemoryMetricSink();
    const failedRepository = new ScriptedCreditRepository(applied());
    await expect(
      service(failedRepository, failedSink).runMetered(REQUEST, async () => {
        throw new Error("MA failed");
      }),
    ).rejects.toThrow("MA failed");
    expect(failedRepository.refundFailedOperation).toHaveBeenCalledWith(
      "decision-monitoring",
    );
    expect(failedSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_credits_refunded_total",
          labels: {
            action: "generate_design",
            reason: "downstream_failure",
          },
          value: 5,
        },
        {
          name: "ptv_metered_operation_total",
          labels: { action: "generate_design", outcome: "failed_refunded" },
          value: 1,
        },
      ]),
    );

    const replaySink = new InMemoryMetricSink();
    const operation = vi.fn(async () => "must-not-run");
    const replay = await service(
      new ScriptedCreditRepository(applied(), false),
      replaySink,
    ).runMetered(REQUEST, operation);
    expect(replay).toEqual(applied());
    expect(operation).not.toHaveBeenCalled();
    expect(replaySink.snapshot().counters).toContainEqual({
      name: "ptv_metered_operation_total",
      labels: { action: "generate_design", outcome: "replay_not_started" },
      value: 1,
    });
  });

  it("keeps debit behavior unchanged when every metric record throws", async () => {
    const throwingSink: MetricSink = {
      record() {
        throw new Error("monitoring unavailable");
      },
    };

    await expect(
      service(new ScriptedCreditRepository(applied()), throwingSink).debit(REQUEST),
    ).resolves.toEqual(applied());
  });
});
