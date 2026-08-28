import type {
  CreditAction,
  CreditBalance,
  CreditDebitRequest,
  CreditDebitResult,
} from "../../packages/contracts";

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
}

export function createCreditService(options: CreateCreditServiceOptions) {
  async function getOrCreateBalance(sellerId: string): Promise<CreditBalance> {
    return options.repository.ensureAccount(sellerId, options.seedCredits);
  }

  async function debit(request: CreditDebitRequest): Promise<CreditDebitResult> {
    await getOrCreateBalance(request.sellerId);
    return options.repository.debit(request, options.costs[request.action]);
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
      return result;
    }

    try {
      const value = await expensiveOperation();
      await options.repository.markOperationSucceeded(result.decision.id);
      return value;
    } catch (error) {
      try {
        await options.repository.refundFailedOperation(result.decision.id);
      } finally {
        throw error;
      }
    }
  }

  return { debit, getOrCreateBalance, runMetered };
}
