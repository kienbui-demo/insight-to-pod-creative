import { SCORING_CONFIG } from "../../packages/config";
import type { CrawlSource, TrendCard } from "../../packages/contracts";

// Pragmatic MVP default — G1 mandates a larger penalty for missing priority source but gives no number; candidate to move into scoring config later.
export const PRIORITY_SOURCE_CONFIDENCE_MULTIPLIER = 0.8;

export interface NormalizedOpportunityComponents {
  demand?: number;
  provenIntent?: number;
  earlyCulture?: number;
  competitionInverse?: number;
}

export interface OpportunityScoringInput {
  components: NormalizedOpportunityComponents;
  availableSources: CrawlSource[];
  missingSources: CrawlSource[];
}

export type OpportunityScoringResult = Pick<
  TrendCard,
  "opportunityScore" | "confidence"
>;

type ComponentName = keyof NormalizedOpportunityComponents;

interface WeightedComponents {
  weightedScore: number;
  availableWeight: number;
}

const ALL_SOURCES: readonly CrawlSource[] = [
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
];

const COMPONENT_NAMES: readonly ComponentName[] = [
  "demand",
  "provenIntent",
  "earlyCulture",
  "competitionInverse",
];

function assertNoDuplicateSources(
  sources: CrawlSource[],
  fieldName: "availableSources" | "missingSources",
): void {
  if (new Set(sources).size !== sources.length) {
    throw new Error(`${fieldName} must not contain duplicate sources`);
  }
}

function validateSources(
  availableSources: CrawlSource[],
  missingSources: CrawlSource[],
): void {
  assertNoDuplicateSources(availableSources, "availableSources");
  assertNoDuplicateSources(missingSources, "missingSources");

  const available = new Set(availableSources);
  const missing = new Set(missingSources);

  for (const source of available) {
    if (missing.has(source)) {
      throw new Error(
        `Source ${source} cannot be both available and missing`,
      );
    }
  }

  for (const source of ALL_SOURCES) {
    if (!available.has(source) && !missing.has(source)) {
      throw new Error(`Source ${source} must be listed as available or missing`);
    }
  }
}

function calculateWeightedComponents(
  components: NormalizedOpportunityComponents,
): WeightedComponents {
  let weightedScore = 0;
  let availableWeight = 0;

  for (const componentName of COMPONENT_NAMES) {
    const component = components[componentName];

    if (component === undefined) {
      continue;
    }

    if (!Number.isFinite(component) || component < 0 || component > 1) {
      throw new Error(
        `${componentName} must be a finite normalized value between 0 and 1`,
      );
    }

    const weight = SCORING_CONFIG.weights[componentName];
    weightedScore += component * weight;
    availableWeight += weight;
  }

  return { weightedScore, availableWeight };
}

function calculateConfidence(
  availableWeight: number,
  missingSources: CrawlSource[],
): number {
  return missingSources.includes("meta_ads")
    ? availableWeight * PRIORITY_SOURCE_CONFIDENCE_MULTIPLIER
    : availableWeight;
}

export function scoreOpportunity(
  input: OpportunityScoringInput,
): OpportunityScoringResult {
  validateSources(input.availableSources, input.missingSources);

  const { weightedScore, availableWeight } = calculateWeightedComponents(
    input.components,
  );

  if (availableWeight === 0) {
    return { opportunityScore: 0, confidence: 0 };
  }

  const opportunityScore = (weightedScore / availableWeight) * 100;
  const confidence = calculateConfidence(
    availableWeight,
    input.missingSources,
  );

  return { opportunityScore, confidence };
}
