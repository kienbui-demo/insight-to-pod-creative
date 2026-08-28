import { describe, expect, it, vi } from "vitest";

import { CREDIT_COSTS, DEFAULT_SEED_CREDIT_GRANT } from "../../../packages/config/credits.config";
import type {
  CreditBalance,
  CreditDebitRequest,
  CreditDebitResult,
  CreditLedgerEntry,
} from "../../../packages/contracts";
import { createCreditService } from "../credit-service";

const NOW = "2026-08-28T09:00:00.000Z";

type OperationStatus =
  | "not_started"
  | "started"
  | "succeeded"
  | "failed_refunded";

interface AccountState {
  balance: number;
  version: number;
}

interface StoredDecision {
  result: Extract<CreditDebitResult, { decision: unknown }>;
  operationStatus: OperationStatus;
}

class InMemoryCreditRepository {
  private readonly accounts = new Map<string, AccountState>();
  private readonly decisions = new Map<string, StoredDecision>();
  private readonly entries: CreditLedgerEntry[] = [];
  private sequence = 0;

  async ensureAccount(sellerId: string, seedCredits: number): Promise<CreditBalance> {
    if (!this.accounts.has(sellerId)) {
      this.accounts.set(sellerId, { balance: seedCredits, version: 1 });
      this.entries.push({
        id: this.nextId("ledger"),
        sellerId,
        kind: "grant",
        grantReason: "seed",
        credits: seedCredits,
        idempotencyKey: "seed-grant:v1",
        balanceAfter: seedCredits,
        createdAt: NOW,
      });
    }
    return this.getBalance(sellerId);
  }

  async debit(request: CreditDebitRequest, cost: number): Promise<CreditDebitResult> {
    const key = this.key(request.sellerId, request.idempotencyKey);
    const existing = this.decisions.get(key);
    if (existing) {
      const decision = existing.result.decision;
      if (decision.runId !== request.runId || decision.action !== request.action) {
        return {
          ok: false,
          error: {
            code: "idempotency_conflict",
            sellerId: request.sellerId,
            idempotencyKey: request.idempotencyKey,
            existingRunId: decision.runId,
            requestedRunId: request.runId,
            existingAction: decision.action,
            requestedAction: request.action,
          },
        };
      }
      return existing.result;
    }

    const account = this.requiredAccount(request.sellerId);
    const decisionBase = {
      id: this.nextId("decision"),
      ...request,
      cost,
      balanceBefore: account.balance,
      decidedAt: NOW,
    };

    if (account.balance < cost) {
      const result = {
        ok: false,
        decision: {
          ...decisionBase,
          status: "rejected",
          balanceAfter: account.balance,
        },
        error: {
          code: "insufficient_credit",
          ...request,
          requiredCredits: cost,
          availableCredits: account.balance,
        },
      } satisfies CreditDebitResult;
      this.decisions.set(key, { result, operationStatus: "not_started" });
      return result;
    }

    account.balance -= cost;
    account.version += 1;
    const result = {
      ok: true,
      decision: {
        ...decisionBase,
        status: "applied",
        balanceAfter: account.balance,
      },
    } satisfies CreditDebitResult;
    this.decisions.set(key, { result, operationStatus: "not_started" });
    this.entries.push({
      id: this.nextId("ledger"),
      sellerId: request.sellerId,
      kind: "debit",
      action: request.action,
      credits: cost,
      idempotencyKey: request.idempotencyKey,
      debitDecisionId: result.decision.id,
      balanceAfter: account.balance,
      createdAt: NOW,
    });
    return result;
  }

  async claimOperation(decisionId: string): Promise<boolean> {
    const stored = this.findByDecisionId(decisionId);
    if (!stored || stored.operationStatus !== "not_started") {
      return false;
    }
    stored.operationStatus = "started";
    return true;
  }

  async markOperationSucceeded(decisionId: string): Promise<void> {
    const stored = this.findByDecisionId(decisionId);
    if (stored?.operationStatus === "started") {
      stored.operationStatus = "succeeded";
    }
  }

  async refundFailedOperation(decisionId: string): Promise<void> {
    const stored = this.findByDecisionId(decisionId);
    if (!stored || !stored.result.ok || stored.operationStatus === "failed_refunded") {
      return;
    }
    const decision = stored.result.decision;
    const account = this.requiredAccount(decision.sellerId);
    account.balance += decision.cost;
    account.version += 1;
    stored.operationStatus = "failed_refunded";
    this.entries.push({
      id: this.nextId("ledger"),
      sellerId: decision.sellerId,
      kind: "grant",
      grantReason: "refund",
      credits: decision.cost,
      idempotencyKey: `refund:${decision.id}`,
      originalDebitDecisionId: decision.id,
      balanceAfter: account.balance,
      createdAt: NOW,
    });
  }

  getBalance(sellerId: string): CreditBalance {
    const account = this.requiredAccount(sellerId);
    return {
      sellerId,
      availableCredits: account.balance,
      version: account.version,
      updatedAt: NOW,
    };
  }

  setBalanceForTest(sellerId: string, balance: number): void {
    this.requiredAccount(sellerId).balance = balance;
  }

  ledgerEntries(sellerId: string): CreditLedgerEntry[] {
    return this.entries.filter((entry) => entry.sellerId === sellerId);
  }

  operationStatus(decisionId: string): OperationStatus | undefined {
    return this.findByDecisionId(decisionId)?.operationStatus;
  }

  private requiredAccount(sellerId: string): AccountState {
    const account = this.accounts.get(sellerId);
    if (!account) {
      throw new Error(`Missing account for ${sellerId}`);
    }
    return account;
  }

  private findByDecisionId(decisionId: string): StoredDecision | undefined {
    return [...this.decisions.values()].find(
      ({ result }) => result.decision.id === decisionId,
    );
  }

  private key(sellerId: string, idempotencyKey: string): string {
    return `${sellerId}:${idempotencyKey}`;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}

function request(
  overrides: Partial<CreditDebitRequest> = {},
): CreditDebitRequest {
  return {
    sellerId: "seller-c7",
    runId: "run-c7",
    action: "generate_design",
    idempotencyKey: "debit-c7",
    ...overrides,
  };
}

function setup() {
  const repository = new InMemoryCreditRepository();
  const service = createCreditService({
    repository,
    costs: CREDIT_COSTS,
    seedCredits: DEFAULT_SEED_CREDIT_GRANT,
  });
  return { repository, service };
}

describe("C7 credit debit service", () => {
  it("creates one 20-credit seed grant for a new seller", async () => {
    const { repository, service } = setup();

    const first = await service.getOrCreateBalance("seller-c7");
    const second = await service.getOrCreateBalance("seller-c7");

    expect(first.availableCredits).toBe(20);
    expect(second).toEqual(first);
    expect(repository.ledgerEntries("seller-c7")).toEqual([
      expect.objectContaining({
        kind: "grant",
        grantReason: "seed",
        credits: 20,
        balanceAfter: 20,
      }),
    ]);
  });

  it("atomically applies a sufficient debit, appends one ledger entry, and bumps version", async () => {
    const { repository, service } = setup();
    await service.getOrCreateBalance("seller-c7");

    const result = await service.debit(request());

    expect(result).toMatchObject({
      ok: true,
      decision: {
        status: "applied",
        cost: 5,
        balanceBefore: 20,
        balanceAfter: 15,
      },
    });
    if (!result.ok) throw new Error("Expected applied debit");
    expect(repository.getBalance("seller-c7")).toMatchObject({
      availableCredits: 15,
      version: 2,
    });
    expect(repository.ledgerEntries("seller-c7")).toContainEqual(
      expect.objectContaining({
        kind: "debit",
        credits: 5,
        debitDecisionId: result.decision.id,
        balanceAfter: 15,
      }),
    );
  });

  it("persists an insufficient decision without changing balance or appending a debit", async () => {
    const { repository, service } = setup();
    await service.getOrCreateBalance("seller-c7");
    repository.setBalanceForTest("seller-c7", 1);

    const result = await service.debit(request());

    expect(result).toEqual({
      ok: false,
      decision: expect.objectContaining({
        status: "rejected",
        balanceBefore: 1,
        balanceAfter: 1,
      }),
      error: {
        code: "insufficient_credit",
        sellerId: "seller-c7",
        runId: "run-c7",
        action: "generate_design",
        idempotencyKey: "debit-c7",
        requiredCredits: 5,
        availableCredits: 1,
      },
    });
    expect(repository.getBalance("seller-c7").availableCredits).toBe(1);
    expect(
      repository.ledgerEntries("seller-c7").filter((entry) => entry.kind === "debit"),
    ).toEqual([]);
  });

  it("returns the canonical applied result on replay without a replay flag or double debit", async () => {
    const { repository, service } = setup();
    await service.getOrCreateBalance("seller-c7");

    const first = await service.debit(request());
    const replay = await service.debit(request());

    expect(replay).toEqual(first);
    expect(replay).not.toHaveProperty("replayed");
    expect(repository.getBalance("seller-c7").availableCredits).toBe(15);
    expect(
      repository.ledgerEntries("seller-c7").filter((entry) => entry.kind === "debit"),
    ).toHaveLength(1);
  });

  it("returns the same persisted insufficient result after the balance later changes", async () => {
    const { repository, service } = setup();
    await service.getOrCreateBalance("seller-c7");
    repository.setBalanceForTest("seller-c7", 1);
    const first = await service.debit(request());
    repository.setBalanceForTest("seller-c7", 20);

    const replay = await service.debit(request());

    expect(replay).toEqual(first);
    expect(replay).not.toHaveProperty("replayed");
    expect(
      repository.ledgerEntries("seller-c7").filter((entry) => entry.kind === "debit"),
    ).toEqual([]);
  });

  it.each([
    {
      name: "runId",
      overrides: { runId: "run-different" },
      expected: {
        existingRunId: "run-c7",
        requestedRunId: "run-different",
        existingAction: "generate_design",
        requestedAction: "generate_design",
      },
    },
    {
      name: "action",
      overrides: { action: "deep_analysis" as const },
      expected: {
        existingRunId: "run-c7",
        requestedRunId: "run-c7",
        existingAction: "generate_design",
        requestedAction: "deep_analysis",
      },
    },
  ])("rejects idempotency-key reuse with a different $name and starts no free operation", async ({ overrides, expected }) => {
    const { repository, service } = setup();
    await service.getOrCreateBalance("seller-c7");
    await service.debit(request());
    const expensiveOperation = vi.fn(async () => "must-not-run");

    const [attempt] = await Promise.allSettled([
      service.runMetered(request(overrides), expensiveOperation),
    ]);

    expect(attempt.status).toBe("fulfilled");
    if (attempt.status !== "fulfilled") throw attempt.reason;
    expect(attempt.value).toEqual({
      ok: false,
      error: {
        code: "idempotency_conflict",
        sellerId: "seller-c7",
        idempotencyKey: "debit-c7",
        ...expected,
      },
    });
    expect(expensiveOperation).not.toHaveBeenCalled();
    expect(repository.getBalance("seller-c7").availableCredits).toBe(15);
  });

  it("auto-refunds a failed downstream operation exactly once", async () => {
    const { repository, service } = setup();
    await service.getOrCreateBalance("seller-c7");
    const failure = new Error("MA operation failed");
    const firstOperation = vi.fn(async () => {
      throw failure;
    });

    await expect(service.runMetered(request(), firstOperation)).rejects.toThrow(
      "MA operation failed",
    );
    const debit = repository
      .ledgerEntries("seller-c7")
      .find((entry) => entry.kind === "debit");
    if (!debit || debit.kind !== "debit") throw new Error("Missing debit");

    const replayOperation = vi.fn(async () => "must-not-run");
    await Promise.allSettled([service.runMetered(request(), replayOperation)]);

    expect(repository.operationStatus(debit.debitDecisionId)).toBe(
      "failed_refunded",
    );
    expect(repository.getBalance("seller-c7")).toMatchObject({
      availableCredits: 20,
      version: 3,
    });
    expect(
      repository
        .ledgerEntries("seller-c7")
        .filter(
          (entry) => entry.kind === "grant" && entry.grantReason === "refund",
        ),
    ).toHaveLength(1);
    expect(replayOperation).not.toHaveBeenCalled();
  });

  it("uses a refund key distinct from the debit key", async () => {
    const { repository, service } = setup();
    await service.getOrCreateBalance("seller-c7");
    await expect(
      service.runMetered(request(), async () => {
        throw new Error("Seedream failed through MA");
      }),
    ).rejects.toThrow("Seedream failed through MA");

    const entries = repository.ledgerEntries("seller-c7");
    const debit = entries.find((entry) => entry.kind === "debit");
    const refund = entries.find(
      (entry) => entry.kind === "grant" && entry.grantReason === "refund",
    );
    if (!debit || debit.kind !== "debit" || !refund || refund.kind !== "grant" || refund.grantReason !== "refund") {
      throw new Error("Expected debit and refund entries");
    }

    expect(refund.originalDebitDecisionId).toBe(debit.debitDecisionId);
    expect(refund.idempotencyKey).not.toBe(debit.idempotencyKey);
    expect(new Set([debit.idempotencyKey, refund.idempotencyKey]).size).toBe(2);
  });
});
