import type {
  CreditAction,
  CreditBalance,
  CreditDebitRequest,
  CreditDebitResult,
  CreditDecisionOutcome,
  MetricSink,
  MeteredOperationOutcome,
} from "../../packages/contracts";
import { NOOP_METRIC_SINK } from "../monitoring/no-op-metric-sink";
import { SafeMetricSink } from "../monitoring/safe-metric-sink";

export interface CreditRepository {
  ensureAccount(sellerId: string, seedCredits: number): Promise<CreditBalance>;
  debit(request: CreditDebitRequest, cost: number): Promise<CreditDebitResult>;
  claimOperation(decisionId: string): Promise<boolean>;
  markOperationSucceeded(decisionId: string): Promise<void>;
  refundFailedOperation(decisionId: string): Promise<void>;
}

interface CreateCreditServiceOptions {
  repository: CreditRepository;
  costs: Readonly<Record<CreditAction, number>>;
  seedCredits: number;
  metricSink?: MetricSink;
}

export function createCreditService(options: CreateCreditServiceOptions) {
  const metricSink = new SafeMetricSink(
    options.metricSink ?? NOOP_METRIC_SINK,
  );

  function recordDecision(
    action: CreditAction,
    outcome: CreditDecisionOutcome,
    observedAt: string,
    observationId?: string,
  ): void {
    metricSink.record({
      name: "ptv_credit_decision_total",
      kind: "counter",
      value: 1,
      labels: { action, outcome },
      observedAt,
      observationId,
    });
  }

  function recordMeteredOperation(
    action: CreditAction,
    outcome: MeteredOperationOutcome,
    observedAt: string,
    decisionId: string,
  ): void {
    metricSink.record({
      name: "ptv_metered_operation_total",
      kind: "counter",
      value: 1,
      labels: { action, outcome },
      observedAt,
      observationId: `metered-operation:${decisionId}:${outcome}`,
    });
  }

  async function getOrCreateBalance(sellerId: string): Promise<CreditBalance> {
    return options.repository.ensureAccount(sellerId, options.seedCredits);
  }

  async function debit(request: CreditDebitRequest): Promise<CreditDebitResult> {
    await getOrCreateBalance(request.sellerId);
    const result = await options.repository.debit(
      request,
      options.costs[request.action],
    );
    if ("decision" in result) {
      const { decision } = result;
      recordDecision(
        decision.action,
        decision.status,
        decision.decidedAt,
        `credit-decision:${decision.id}`,
      );
      if (decision.status === "applied") {
        metricSink.record({
          name: "ptv_credits_debited_total",
          kind: "counter",
          value: decision.cost,
          labels: { action: decision.action },
          observedAt: decision.decidedAt,
          observationId: `credit-debit:${decision.id}`,
        });
      }
    } else {
      recordDecision(
        result.error.requestedAction,
        "conflict",
        new Date().toISOString(),
      );
    }
    return result;
  }

  async function runMetered<T>(
    request: CreditDebitRequest,
    expensiveOperation: () => Promise<T>,
  ): Promise<T | CreditDebitResult> {
    const result = await debit(request);
    if (!result.ok) {
      return result;
    }

    const claimed = await options.repository.claimOperation(result.decision.id);
    if (!claimed) {
      recordMeteredOperation(
        result.decision.action,
        "replay_not_started",
        result.decision.decidedAt,
        result.decision.id,
      );
      return result;
    }

    try {
      const value = await expensiveOperation();
      await options.repository.markOperationSucceeded(result.decision.id);
      recordMeteredOperation(
        result.decision.action,
        "succeeded",
        result.decision.decidedAt,
        result.decision.id,
      );
      return value;
    } catch (error) {
      try {
        await options.repository.refundFailedOperation(result.decision.id);
        metricSink.record({
          name: "ptv_credits_refunded_total",
          kind: "counter",
          value: result.decision.cost,
          labels: {
            action: result.decision.action,
            reason: "downstream_failure",
          },
          observedAt: result.decision.decidedAt,
          observationId: `credit-refund:${result.decision.id}`,
        });
        recordMeteredOperation(
          result.decision.action,
          "failed_refunded",
          result.decision.decidedAt,
          result.decision.id,
        );
      } finally {
        throw error;
      }
    }
  }

  return { debit, getOrCreateBalance, runMetered };
}
