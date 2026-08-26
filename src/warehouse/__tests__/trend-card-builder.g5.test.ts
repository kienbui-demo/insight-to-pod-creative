import { describe, expect, it } from "vitest";

import { SCORING_CONFIG } from "../../../packages/config";
import type { CrawlSource, TrendCard } from "../../../packages/contracts";
import {
  PRIORITY_SOURCE_CONFIDENCE_MULTIPLIER,
  scoreOpportunity,
} from "../../scoring/opportunity-score";
import {
  ALL_CRAWL_SOURCES,
  RECORDS_BY_SOURCE,
  canonicalRecord,
} from "../__fixtures__/canonical-records";
import { reduceOpportunityComponents } from "../component-reducer";
import { buildTrendCard } from "../trend-card-builder";
import type {
  WarehouseBuildInput,
  WarehouseBuilderDependencies,
} from "../types";
import { FakeCrawlTransport } from "./support/fake-crawl-transport";
import { createFakeAdapters } from "./support/fake-source-adapters";
import { FixedClock } from "./support/fixed-clock";
import { MockMaRecommendation } from "./support/mock-ma-recommendation";

const INPUT: WarehouseBuildInput = {
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  freshnessTier: "warm",
};

function completeOutputs(): Partial<Record<CrawlSource, unknown>> {
  return Object.fromEntries(
    ALL_CRAWL_SOURCES.map((source) => [source, RECORDS_BY_SOURCE[source]]),
  );
}

function createHarness(options: {
  outputs?: Partial<Record<CrawlSource, unknown>>;
  errors?: Partial<Record<CrawlSource, Error>>;
  adapters?: WarehouseBuilderDependencies["adapters"];
} = {}): {
  dependencies: WarehouseBuilderDependencies;
  recommendation: MockMaRecommendation;
  loggedFailures: { source: CrawlSource; error: unknown }[];
} {
  const recommendation = new MockMaRecommendation();
  const loggedFailures: { source: CrawlSource; error: unknown }[] = [];

  return {
    dependencies: {
      adapters: options.adapters ?? createFakeAdapters(ALL_CRAWL_SOURCES),
      transport: new FakeCrawlTransport({
        outputs: options.outputs ?? completeOutputs(),
        errors: options.errors,
      }),
      reducer: { reduce: reduceOpportunityComponents },
      recommendation,
      clock: new FixedClock(),
      logger: {
        sourceFailure(source, error) {
          loggedFailures.push({ source, error });
        },
      },
    },
    recommendation,
    loggedFailures,
  };
}

function expectValidCard(card: TrendCard): void {
  expect(card.id).toEqual(expect.any(String));
  expect(card.market).toBe(INPUT.market);
  expect(card.seed).toBe(INPUT.seed);
  expect(card.opportunityScore).toBeGreaterThanOrEqual(0);
  expect(card.opportunityScore).toBeLessThanOrEqual(100);
  expect(card.confidence).toBeGreaterThanOrEqual(0);
  expect(card.confidence).toBeLessThanOrEqual(1);
  expect(card.recommendation).toEqual({
    action: expect.any(String),
    reasoning: expect.any(String),
  });
  expect(card.updatedAt).toEqual(expect.any(String));
}

describe("buildTrendCard G5 degrade gracefully", () => {
  it.each(ALL_CRAWL_SOURCES)(
    "returns a valid card when %s throws in isolation",
    async (failedSource) => {
      const sourceError = new Error(`${failedSource} unavailable`);
      const harness = createHarness({
        errors: { [failedSource]: sourceError },
      });

      const card = await buildTrendCard(INPUT, harness.dependencies);

      expectValidCard(card);
      expect(card.missingSources).toEqual([failedSource]);
      expect(card.availableSources).toEqual(
        ALL_CRAWL_SOURCES.filter((source) => source !== failedSource),
      );
      expect(harness.loggedFailures).toEqual([
        { source: failedSource, error: sourceError },
      ]);
      expect(harness.recommendation.calls).toHaveLength(1);
      expect(
        harness.recommendation.calls[0].records.every(
          (record) => record.source !== failedSource,
        ),
      ).toBe(true);
    },
  );

  it("marks Meta missing, omits provenIntent, and lets B3 apply its priority penalty", async () => {
    const harness = createHarness({
      errors: { meta_ads: new Error("Meta timeout") },
    });

    const card = await buildTrendCard(INPUT, harness.dependencies);
    const context = harness.recommendation.calls[0];
    const b3Result = scoreOpportunity({
      components: context.components,
      availableSources: context.availableSources,
      missingSources: context.missingSources,
    });
    const availableComponentWeight =
      SCORING_CONFIG.weights.demand +
      SCORING_CONFIG.weights.earlyCulture +
      SCORING_CONFIG.weights.competitionInverse;

    expect(card.missingSources).toContain("meta_ads");
    expect(context.components.provenIntent).toBeUndefined();
    expect(card.opportunityScore).toBe(b3Result.opportunityScore);
    expect(card.confidence).toBe(b3Result.confidence);
    expect(card.confidence).toBeCloseTo(
      availableComponentWeight * PRIORITY_SOURCE_CONFIDENCE_MULTIPLIER,
    );
    expect(card.confidence).toBeLessThan(availableComponentWeight);
  });

  it("marks TikTok missing but retains earlyCulture without inventing a source penalty", async () => {
    const harness = createHarness({
      errors: { tiktok: new Error("TikTok timeout") },
    });

    const card = await buildTrendCard(INPUT, harness.dependencies);
    const context = harness.recommendation.calls[0];
    const b3Result = scoreOpportunity({
      components: context.components,
      availableSources: context.availableSources,
      missingSources: context.missingSources,
    });

    expect(card.missingSources).toContain("tiktok");
    expect(context.components.earlyCulture).toBeDefined();
    expect(card.opportunityScore).toBe(b3Result.opportunityScore);
    expect(card.confidence).toBe(b3Result.confidence);
  });

  it("returns a zero-evidence card successfully when all sources fail", async () => {
    const errors = Object.fromEntries(
      ALL_CRAWL_SOURCES.map((source) => [
        source,
        new Error(`${source} unavailable`),
      ]),
    ) as Record<CrawlSource, Error>;
    const harness = createHarness({ errors });

    const card = await buildTrendCard(INPUT, harness.dependencies);

    expectValidCard(card);
    expect(card.availableSources).toEqual([]);
    expect(card.missingSources).toEqual(ALL_CRAWL_SOURCES);
    expect(card.opportunityScore).toBe(0);
    expect(card.confidence).toBe(0);
    expect(card.trendSeries).toEqual([]);
    expect(card.referenceImages).toEqual([]);
    expect(card.competitors).toBeUndefined();
    expect(harness.loggedFailures).toHaveLength(ALL_CRAWL_SOURCES.length);
    expect(harness.recommendation.calls[0].components).toEqual({});
  });

  it("classifies empty and all-invalid normalized output as missing", async () => {
    const outputs = completeOutputs();
    outputs.reddit = [];
    outputs.pinterest = [
      canonicalRecord("pinterest", "culture", {
        normalizedValue: "not-normalized",
        referenceImageUrls: ["https://tos.example/non-contributing.png"],
      }),
    ];
    const harness = createHarness({ outputs });

    const card = await buildTrendCard(INPUT, harness.dependencies);

    expect(card.missingSources).toEqual(["reddit", "pinterest"]);
    expect(card.availableSources).toEqual(
      ALL_CRAWL_SOURCES.filter(
        (source) => source !== "reddit" && source !== "pinterest",
      ),
    );
    expect(harness.recommendation.calls[0].components.earlyCulture).toBeDefined();
  });

  it("isolates and logs failures from both adapt and normalize stages", async () => {
    const adaptError = new Error("Google adaptation failed");
    const normalizeError = new Error("Reddit normalization failed");
    const adapters = createFakeAdapters(ALL_CRAWL_SOURCES, {
      google_trends: { adaptError },
      reddit: { normalizeError },
    });
    const harness = createHarness({ adapters });

    const card = await buildTrendCard(INPUT, harness.dependencies);

    expect(card.missingSources).toEqual(["google_trends", "reddit"]);
    expect(harness.loggedFailures).toEqual([
      { source: "google_trends", error: adaptError },
      { source: "reddit", error: normalizeError },
    ]);
  });

  it("always produces an exhaustive, duplicate-free, mutually exclusive source partition", async () => {
    const outputs = completeOutputs();
    outputs.reddit = [];
    const harness = createHarness({
      outputs,
      errors: { amazon: new Error("Amazon timeout") },
    });

    const card = await buildTrendCard(INPUT, harness.dependencies);
    const available = new Set(card.availableSources);
    const missing = new Set(card.missingSources);

    expect(available.size).toBe(card.availableSources.length);
    expect(missing.size).toBe(card.missingSources.length);
    expect([...available].every((source) => !missing.has(source))).toBe(true);
    expect(new Set([...available, ...missing])).toEqual(
      new Set(ALL_CRAWL_SOURCES),
    );
    expect(() =>
      scoreOpportunity({
        components: harness.recommendation.calls[0].components,
        availableSources: card.availableSources,
        missingSources: card.missingSources,
      }),
    ).not.toThrow();
  });
});
