import type { CreditAction } from "../contracts";

export type CreditCosts = Readonly<Record<CreditAction, number>>;

export const DEFAULT_SEED_CREDIT_GRANT = 20;

// generate_design includes a concept plus one draft image; refinement/regeneration is a new action.
// deep_analysis includes cache-miss and free-form deep-dives. Publishing remains unmetered.
export const CREDIT_COSTS: CreditCosts = {
  generate_design: 5,
  deep_analysis: 2,
};
