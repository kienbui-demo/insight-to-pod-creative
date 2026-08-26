import { describe, expect, it } from "vitest";

import type { CrawlSource } from "../../../packages/contracts";
import { scoreOpportunity } from "../../scoring/opportunity-score";
import {
  ALL_CRAWL_SOURCES,
  COMPETITORS,
  GOOGLE_TREND_SERIES,
  RECORDS_BY_SOURCE,
  REFERENCE_IMAGE_URLS,
} from "../__fixtures__/canonical-records";
import { reduceOpportunityComponents } from "../component-reducer";
import { buildTrendCard } from "../trend-card-builder";
import type {
  WarehouseBuildInput,
  WarehouseBuilderDependencies,
} from "../types";
import { FakeCrawlTransport } from "./support/fake-crawl-transport";
import { createFakeAdapters } from "./support/fake-source-adapters";
import { FIXED_NOW, FixedClock } from "./support/fixed-clock";
import {
  MockMaRecommendation,
  TEST_RECOMMENDATION,
} from "./support/mock-ma-recommendation";

const BASE_INPUT: WarehouseBuildInput = {
  market: "US",
  seed: "Retro Halloween Cats",
  productType: "T-Shirt",
  window: { from: "2026-08-01", to: "2026-08-27" },
  limit: 25,
  freshnessTier: "hot",
};

function allOutputs(): Partial<Record<CrawlSource, unknown>> {
  return Object.fromEntries(
    ALL_CRAWL_SOURCES.map((source) => [source, RECORDS_BY_SOURCE[source]]),
  );
}

function createDependencies(options: {
  recommendation?: MockMaRecommendation;
  transport?: FakeCrawlTransport;
} = {}): {
  dependencies: WarehouseBuilderDependencies;
  recommendation: MockMaRecommendation;
  transport: FakeCrawlTransport;
  failures: { source: CrawlSource; error: unknown }[];
} {
  const recommendation =
    options.recommendation ?? new MockMaRecommendation();
  const transport =
    options.transport ?? new FakeCrawlTransport({ outputs: allOutputs() });
  const failures: { source: CrawlSource; error: unknown }[] = [];

  return {
    dependencies: {
      adapters: createFakeAdapters(ALL_CRAWL_SOURCES),
      transport,
      reducer: { reduce: reduceOpportunityComponents },
      recommendation,
      clock: new FixedClock(),
      logger: {
        sourceFailure(source, error) {
          failures.push({ source, error });
        },
      },
    },
    recommendation,
    transport,
    failures,
  };
}

describe("buildTrendCard", () => {
  it("runs every adapter in batch mode and assembles the complete TrendCard", async () => {
    const harness = createDependencies();

    const card = await buildTrendCard(BASE_INPUT, harness.dependencies);

    expect(harness.transport.calls).toHaveLength(ALL_CRAWL_SOURCES.length);
    for (const source of ALL_CRAWL_SOURCES) {
      const call = harness.transport.calls.find(
        (candidate) => candidate.source === source,
      );
      expect(call?.request).toEqual({
        source,
        market: BASE_INPUT.market,
        seed: BASE_INPUT.seed,
        productType: BASE_INPUT.productType,
        window: BASE_INPUT.window,
        limit: BASE_INPUT.limit,
        mode: "batch",
      });
    }

    expect(card).toMatchObject({
      market: BASE_INPUT.market,
      seed: BASE_INPUT.seed,
      productType: BASE_INPUT.productType,
      availableSources: ALL_CRAWL_SOURCES,
      missingSources: [],
      trendSeries: GOOGLE_TREND_SERIES,
      referenceImages: REFERENCE_IMAGE_URLS,
      competitors: COMPETITORS,
      recommendation: TEST_RECOMMENDATION,
      freshnessTier: "hot",
      updatedAt: FIXED_NOW,
    });
    expect(card.id).toMatch(/^trend_[a-f0-9]{64}$/);
    expect(harness.failures).toEqual([]);
  });

  it("passes reducer output and B3 scoring unchanged to MA and the card", async () => {
    const harness = createDependencies();

    const card = await buildTrendCard(BASE_INPUT, harness.dependencies);
    const context = harness.recommendation.calls[0];
    const expectedScoring = scoreOpportunity({
      components: context.components,
      availableSources: context.availableSources,
      missingSources: context.missingSources,
    });

    expect(harness.recommendation.calls).toHaveLength(1);
    expect(context.components).toEqual({
      demand: 0.7,
      provenIntent: 0.75,
      earlyCulture: 0.75,
      competitionInverse: 0.7,
    });
    expect(context).toMatchObject(expectedScoring);
    expect(card.opportunityScore).toBe(expectedScoring.opportunityScore);
    expect(card.confidence).toBe(expectedScoring.confidence);
  });

  it("creates the same id for the same canonical tuple and a different id for a different tuple", async () => {
    const first = createDependencies();
    const equivalent = createDependencies();
    const different = createDependencies();

    const firstCard = await buildTrendCard(BASE_INPUT, first.dependencies);
    const equivalentCard = await buildTrendCard(
      {
        ...BASE_INPUT,
        market: "us",
        seed: "  retro   HALLOWEEN cats ",
        productType: " t-shirt ",
      },
      equivalent.dependencies,
    );
    const differentCard = await buildTrendCard(
      { ...BASE_INPUT, productType: "mug" },
      different.dependencies,
    );

    expect(equivalentCard.id).toBe(firstCard.id);
    expect(differentCard.id).not.toBe(firstCard.id);
  });

  it("uses empty pass-through fields and omits competitors when none exist", async () => {
    const outputs = allOutputs();
    outputs.google_trends = RECORDS_BY_SOURCE.google_trends.map((record) => ({
      ...record,
      payload: { normalizedValue: record.payload.normalizedValue },
    }));
    outputs.pinterest = RECORDS_BY_SOURCE.pinterest.map((record) => ({
      ...record,
      payload: { normalizedValue: record.payload.normalizedValue },
    }));
    outputs.tiktok = RECORDS_BY_SOURCE.tiktok.map((record) => ({
      ...record,
      payload: { normalizedValue: record.payload.normalizedValue },
    }));
    outputs.amazon = RECORDS_BY_SOURCE.amazon.map((record) => ({
      ...record,
      payload: { normalizedValue: record.payload.normalizedValue },
    }));
    outputs.etsy = RECORDS_BY_SOURCE.etsy.map((record) => ({
      ...record,
      payload: { normalizedValue: record.payload.normalizedValue },
    }));
    const harness = createDependencies({
      transport: new FakeCrawlTransport({ outputs }),
    });

    const card = await buildTrendCard(BASE_INPUT, harness.dependencies);

    expect(card.trendSeries).toEqual([]);
    expect(card.referenceImages).toEqual([]);
    expect(card.competitors).toBeUndefined();
  });

  it("propagates MA recommendation failure without fabricating a fallback", async () => {
    const maError = new Error("MA recommendation unavailable");
    const harness = createDependencies({
      recommendation: new MockMaRecommendation(
        TEST_RECOMMENDATION,
        maError,
      ),
    });

    await expect(
      buildTrendCard(BASE_INPUT, harness.dependencies),
    ).rejects.toBe(maError);
  });
});
