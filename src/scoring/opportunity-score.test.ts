import { describe, expect, it } from "vitest";

import { SCORING_CONFIG } from "../../packages/config/scoring.config";
import { scoreOpportunity } from "./opportunity-score";
import {
  GOLDEN_OPPORTUNITY_SCORE_CASES,
  type OpportunityScoringInput,
} from "./__fixtures__/opportunity-score.golden";

function sourceAgnosticConfidence(input: OpportunityScoringInput): number {
  const totalExpectedWeight = Object.values(SCORING_CONFIG.weights).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const availableWeight = (
    Object.keys(input.components) as Array<keyof OpportunityScoringInput["components"]>
  ).reduce(
    (sum, component) => sum + SCORING_CONFIG.weights[component],
    0,
  );
  const totalSources =
    input.availableSources.length + input.missingSources.length;

  return (
    (availableWeight / totalExpectedWeight) *
    (input.availableSources.length / totalSources)
  );
}

describe("scoreOpportunity G1 golden set", () => {
  it.each(GOLDEN_OPPORTUNITY_SCORE_CASES)(
    "$name",
    ({ input, expectedScoreBand }) => {
      const result = scoreOpportunity(input);

      expect(result.opportunityScore).toBeGreaterThanOrEqual(
        expectedScoreBand.min,
      );
      expect(result.opportunityScore).toBeLessThanOrEqual(
        expectedScoreBand.max,
      );
      expect(result.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(result.opportunityScore).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeCloseTo(
        sourceAgnosticConfidence(input),
        10,
      );
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    },
  );
});

describe("scoreOpportunity input validation", () => {
  const completeSources: Pick<
    OpportunityScoringInput,
    "availableSources" | "missingSources"
  > = {
    availableSources: [
      "google_trends",
      "reddit",
      "pinterest",
      "tiktok",
      "amazon",
      "etsy",
      "meta_ads",
    ],
    missingSources: [],
  };

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a non-normalized component value of %s",
    (demand) => {
      expect(() =>
        scoreOpportunity({ components: { demand }, ...completeSources }),
      ).toThrow();
    },
  );

  it("rejects duplicate source entries", () => {
    expect(() =>
      scoreOpportunity({
        components: { demand: 0.5 },
        availableSources: ["amazon", "amazon"],
        missingSources: [
          "google_trends",
          "reddit",
          "pinterest",
          "tiktok",
          "etsy",
          "meta_ads",
        ],
      }),
    ).toThrow();
  });

  it("rejects a source listed as both available and missing", () => {
    expect(() =>
      scoreOpportunity({
        components: { demand: 0.5 },
        availableSources: ["amazon"],
        missingSources: [
          "google_trends",
          "reddit",
          "pinterest",
          "tiktok",
          "amazon",
          "etsy",
          "meta_ads",
        ],
      }),
    ).toThrow();
  });

  it("rejects omitted known sources", () => {
    expect(() =>
      scoreOpportunity({
        components: { demand: 0.5 },
        availableSources: ["amazon"],
        missingSources: ["meta_ads"],
      }),
    ).toThrow();
  });
});
