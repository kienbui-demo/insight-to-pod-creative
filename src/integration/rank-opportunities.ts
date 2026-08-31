import type { TrendCard } from "../../packages/contracts";

export function rankOpportunities(
  cards: readonly TrendCard[],
): TrendCard[] {
  return [...cards].sort(
    (left, right) => right.opportunityScore - left.opportunityScore,
  );
}
