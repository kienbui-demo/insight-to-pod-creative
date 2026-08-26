import { describe, expect, it } from "vitest";

import {
  ALL_SOURCE_RECORDS,
  canonicalRecord,
} from "../__fixtures__/canonical-records";
import { reduceOpportunityComponents } from "../component-reducer";

describe("reduceOpportunityComponents", () => {
  it("maps provisional normalized signals into the four B3 components", () => {
    const result = reduceOpportunityComponents(ALL_SOURCE_RECORDS);

    expect(result.components).toEqual({
      demand: 0.7,
      provenIntent: 0.75,
      earlyCulture: 0.75,
      competitionInverse: 0.7,
    });
    expect(result.contributingSources).toEqual([
      "google_trends",
      "reddit",
      "pinterest",
      "tiktok",
      "amazon",
      "etsy",
      "meta_ads",
    ]);
  });

  it("uses the arithmetic mean for multiple usable values", () => {
    const result = reduceOpportunityComponents([
      canonicalRecord("amazon", "demand", { normalizedValue: 0.2 }),
      canonicalRecord("amazon", "demand", { normalizedValue: 0.6 }),
      canonicalRecord("etsy", "demand", { normalizedValue: 1 }),
      canonicalRecord("meta_ads", "ad", { normalizedValue: 0.4 }),
      canonicalRecord("meta_ads", "ad", { normalizedValue: 0.8 }),
    ]);

    expect(result.components).toEqual({ demand: 0.6, provenIntent: 0.6 });
    expect(result.contributingSources).toEqual([
      "amazon",
      "etsy",
      "meta_ads",
    ]);
  });

  it("accepts component-ready competition and price values as inverse scores", () => {
    const result = reduceOpportunityComponents([
      canonicalRecord("amazon", "competition", { normalizedValue: 0.25 }),
      canonicalRecord("etsy", "price", { normalizedValue: 0.75 }),
    ]);

    expect(result.components).toEqual({ competitionInverse: 0.5 });
    expect(result.contributingSources).toEqual(["amazon", "etsy"]);
  });

  it.each([
    undefined,
    null,
    "0.5",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -0.01,
    1.01,
  ])("ignores an unusable normalizedValue of %s", (normalizedValue) => {
    const result = reduceOpportunityComponents([
      canonicalRecord("reddit", "culture", { normalizedValue }),
    ]);

    expect(result).toEqual({ components: {}, contributingSources: [] });
  });

  it("ignores source/signal combinations that do not map to a component", () => {
    const result = reduceOpportunityComponents([
      canonicalRecord("reddit", "demand", { normalizedValue: 0.8 }),
      canonicalRecord("meta_ads", "culture", { normalizedValue: 0.7 }),
      canonicalRecord("google_trends", "price", { normalizedValue: 0.6 }),
    ]);

    expect(result).toEqual({ components: {}, contributingSources: [] });
  });

  it("does not count image-only or competitor-only records as contributing", () => {
    const result = reduceOpportunityComponents([
      canonicalRecord("pinterest", "culture", {
        referenceImageUrls: ["https://tos.example/image-only.png"],
      }),
      canonicalRecord("amazon", "competition", {
        competitors: [{ title: "Competitor without a normalized signal" }],
      }),
    ]);

    expect(result).toEqual({ components: {}, contributingSources: [] });
  });
});
