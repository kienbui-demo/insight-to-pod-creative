import type { CrawlSource } from "../../../packages/contracts";

export interface OpportunityScoringInput {
  components: Partial<{
    demand: number;
    provenIntent: number;
    earlyCulture: number;
    competitionInverse: number;
  }>;
  availableSources: CrawlSource[];
  missingSources: CrawlSource[];
}

export interface GoldenOpportunityScoreCase {
  name: string;
  input: OpportunityScoringInput;
  expectedScoreBand: { min: number; max: number };
  expectedConfidence: number;
}

const ALL_SOURCES: CrawlSource[] = [
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
];

const WITHOUT_META: CrawlSource[] = ALL_SOURCES.filter(
  (source) => source !== "meta_ads",
);

const WITHOUT_TIKTOK: CrawlSource[] = ALL_SOURCES.filter(
  (source) => source !== "tiktok",
);

export const GOLDEN_OPPORTUNITY_SCORE_CASES: GoldenOpportunityScoreCase[] = [
  {
    name: "all four components at zero",
    // (0*0.35 + 0*0.30 + 0*0.25 + 0*0.10) / 1.00 * 100 = 0; confidence = 1.00
    input: {
      components: {
        demand: 0,
        provenIntent: 0,
        earlyCulture: 0,
        competitionInverse: 0,
      },
      availableSources: ALL_SOURCES,
      missingSources: [],
    },
    expectedScoreBand: { min: 0, max: 0.001 },
    expectedConfidence: 1,
  },
  {
    name: "all four components at one",
    // (1*0.35 + 1*0.30 + 1*0.25 + 1*0.10) / 1.00 * 100 = 100; confidence = 1.00
    input: {
      components: {
        demand: 1,
        provenIntent: 1,
        earlyCulture: 1,
        competitionInverse: 1,
      },
      availableSources: ALL_SOURCES,
      missingSources: [],
    },
    expectedScoreBand: { min: 99.999, max: 100 },
    expectedConfidence: 1,
  },
  {
    name: "balanced midpoint components",
    // (0.5*0.35 + 0.5*0.30 + 0.5*0.25 + 0.5*0.10) / 1.00 * 100 = 50; confidence = 1.00
    input: {
      components: {
        demand: 0.5,
        provenIntent: 0.5,
        earlyCulture: 0.5,
        competitionInverse: 0.5,
      },
      availableSources: ALL_SOURCES,
      missingSources: [],
    },
    expectedScoreBand: { min: 49.999, max: 50.001 },
    expectedConfidence: 1,
  },
  {
    name: "mixed signals use all G1 weights",
    // (0.8*0.35 + 0.6*0.30 + 0.4*0.25 + 0.2*0.10) / 1.00 * 100 = 58; confidence = 1.00
    input: {
      components: {
        demand: 0.8,
        provenIntent: 0.6,
        earlyCulture: 0.4,
        competitionInverse: 0.2,
      },
      availableSources: ALL_SOURCES,
      missingSources: [],
    },
    expectedScoreBand: { min: 57.999, max: 58.001 },
    expectedConfidence: 1,
  },
  {
    name: "demand-only score is renormalized",
    // (0.7*0.35) / 0.35 * 100 = 70; Meta missing -> confidence = 0.35*0.80 = 0.28
    input: {
      components: { demand: 0.7 },
      availableSources: ["amazon", "etsy"],
      missingSources: [
        "google_trends",
        "reddit",
        "pinterest",
        "tiktok",
        "meta_ads",
      ],
    },
    expectedScoreBand: { min: 69.999, max: 70.001 },
    expectedConfidence: 0.28,
  },
  {
    name: "proven-intent-only score is renormalized",
    // (0.6*0.30) / 0.30 * 100 = 60; confidence = 0.30 (Meta available)
    input: {
      components: { provenIntent: 0.6 },
      availableSources: ["meta_ads"],
      missingSources: [
        "google_trends",
        "reddit",
        "pinterest",
        "tiktok",
        "amazon",
        "etsy",
      ],
    },
    expectedScoreBand: { min: 59.999, max: 60.001 },
    expectedConfidence: 0.3,
  },
  {
    name: "missing Meta applies the priority-source multiplier",
    // (0.8*0.35 + 0.8*0.25 + 0.8*0.10) / 0.70 * 100 = 80; Meta missing -> confidence = 0.70*0.80 = 0.56
    input: {
      components: {
        demand: 0.8,
        earlyCulture: 0.8,
        competitionInverse: 0.8,
      },
      availableSources: WITHOUT_META,
      missingSources: ["meta_ads"],
    },
    expectedScoreBand: { min: 79.999, max: 80.001 },
    expectedConfidence: 0.56,
  },
  {
    name: "missing best-effort TikTok has no extra multiplier",
    // (0.6*0.35 + 0.7*0.30 + 0.8*0.25 + 0.9*0.10) / 1.00 * 100 = 71; confidence = 1.00 (only TikTok missing)
    input: {
      components: {
        demand: 0.6,
        provenIntent: 0.7,
        earlyCulture: 0.8,
        competitionInverse: 0.9,
      },
      availableSources: WITHOUT_TIKTOK,
      missingSources: ["tiktok"],
    },
    expectedScoreBand: { min: 70.999, max: 71.001 },
    expectedConfidence: 1,
  },
  {
    name: "three available components are renormalized",
    // (0.9*0.35 + 0.7*0.30 + 0.4*0.10) / 0.75 * 100 = 75.333333...; confidence = 0.75
    input: {
      components: {
        demand: 0.9,
        provenIntent: 0.7,
        competitionInverse: 0.4,
      },
      availableSources: ["amazon", "etsy", "meta_ads"],
      missingSources: ["google_trends", "reddit", "pinterest", "tiktok"],
    },
    expectedScoreBand: { min: 75.332, max: 75.334 },
    expectedConfidence: 0.75,
  },
  {
    name: "culture and competition can dominate partial evidence",
    // (1*0.25 + 0*0.10) / 0.35 * 100 = 71.428571...; Meta missing -> confidence = 0.35*0.80 = 0.28
    input: {
      components: { earlyCulture: 1, competitionInverse: 0 },
      availableSources: ["google_trends", "reddit", "pinterest", "tiktok"],
      missingSources: ["amazon", "etsy", "meta_ads"],
    },
    expectedScoreBand: { min: 71.427, max: 71.43 },
    expectedConfidence: 0.28,
  },
  {
    name: "strong commercial signals with heavy competition",
    // (0.9*0.35 + 0.9*0.30 + 0.9*0.25 + 0.1*0.10) / 1.00 * 100 = 82; confidence = 1.00
    input: {
      components: {
        demand: 0.9,
        provenIntent: 0.9,
        earlyCulture: 0.9,
        competitionInverse: 0.1,
      },
      availableSources: ALL_SOURCES,
      missingSources: [],
    },
    expectedScoreBand: { min: 81.999, max: 82.001 },
    expectedConfidence: 1,
  },
  {
    name: "low core signals with open competition",
    // (0.2*0.35 + 0.2*0.30 + 0.2*0.25 + 1*0.10) / 1.00 * 100 = 28; confidence = 1.00
    input: {
      components: {
        demand: 0.2,
        provenIntent: 0.2,
        earlyCulture: 0.2,
        competitionInverse: 1,
      },
      availableSources: ALL_SOURCES,
      missingSources: [],
    },
    expectedScoreBand: { min: 27.999, max: 28.001 },
    expectedConfidence: 1,
  },
  {
    name: "no components produce zero score and confidence",
    // No available component weights: score = 0 by approved rule; base confidence = 0, and 0*0.80 = 0 with Meta missing
    input: {
      components: {},
      availableSources: [],
      missingSources: ALL_SOURCES,
    },
    expectedScoreBand: { min: 0, max: 0.001 },
    expectedConfidence: 0,
  },
];
