export interface OpportunityScoreWeights {
  readonly demand: number;
  readonly provenIntent: number;
  readonly earlyCulture: number;
  readonly competitionInverse: number;
}

export interface ScoringConfig {
  readonly weights: OpportunityScoreWeights;
}

// Defaults are defined by specs/spec-hotspots.md G1 and are tunable via reviewed config changes.
export const SCORING_CONFIG: ScoringConfig = {
  weights: {
    demand: 0.35,
    provenIntent: 0.3,
    earlyCulture: 0.25,
    competitionInverse: 0.1,
  },
};
