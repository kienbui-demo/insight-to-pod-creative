import type { TrendCard } from "../../../../packages/contracts";
import type {
  RecommendationContext,
  RecommendationPort,
} from "../../types";

export const TEST_RECOMMENDATION: TrendCard["recommendation"] = {
  action: "Prepare a limited retro-cat Halloween collection.",
  reasoning: "Available signals show a timely cross-source opportunity.",
};

export class MockMaRecommendation implements RecommendationPort {
  readonly calls: RecommendationContext[] = [];

  constructor(
    private readonly result: TrendCard["recommendation"] = TEST_RECOMMENDATION,
    private readonly error?: Error,
  ) {}

  async recommend(
    context: RecommendationContext,
  ): Promise<TrendCard["recommendation"]> {
    this.calls.push(context);
    if (this.error) {
      throw this.error;
    }
    return this.result;
  }
}
