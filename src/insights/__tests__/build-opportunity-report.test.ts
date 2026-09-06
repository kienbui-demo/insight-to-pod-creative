import { describe, expect, it } from "vitest";

import type { TrendCard } from "../../../packages/contracts";
import { buildOpportunityReport } from "../build-opportunity-report";
import { deriveSellerInsights } from "../derive-seller-insights";
import { RETRO_HALLOWEEN_CATS_CARD } from "./fixtures";

function reportText(card: TrendCard): string {
  const report = buildOpportunityReport(card, deriveSellerInsights(card));

  return [
    report.verdictTldr,
    ...report.whyRising,
    ...report.moneyAndCompetition,
    ...report.whitespace,
    ...report.recommendedAction,
    ...report.confidenceAndCaveats,
  ].join(" ");
}

describe("buildOpportunityReport", () => {
  it("builds six concise seller-facing sections from the golden card", () => {
    const insights = deriveSellerInsights(RETRO_HALLOWEEN_CATS_CARD);
    const report = buildOpportunityReport(RETRO_HALLOWEEN_CATS_CARD, insights);
    const text = reportText(RETRO_HALLOWEEN_CATS_CARD);

    expect(Object.keys(report)).toEqual([
      "verdictTldr",
      "whyRising",
      "moneyAndCompetition",
      "whitespace",
      "recommendedAction",
      "confidenceAndCaveats",
    ]);
    expect(report.verdictTldr).toContain("84/100");
    expect(report.verdictTldr).toContain("Act now");
    expect(text).toContain("175%");
    expect(text).toContain("accelerating");
    expect(text).toContain("2026-09-05");
    expect(text).toContain("$19.99");
    expect(text).toContain("$24.99");
    expect(text).toContain("$34.99");
    expect(text).toContain("50%");
    expect(text).toContain("4 competitors");
    expect(text).toContain("medium saturation");
    expect(text).toContain("Meta Ads");
    expect(text).toContain("TikTok");
    expect(text).toContain("t-shirt");
    expect(text).toContain("retro halloween cats");
    expect(text).toContain("Launch a focused three-design capsule");
    expect(text).toContain("83%");
    expect(text).toContain("hot");
    expect(text).toContain("91%");

    expect(typeof report.verdictTldr).toBe("string");
    for (const section of [
      report.whyRising,
      report.moneyAndCompetition,
      report.whitespace,
      report.recommendedAction,
      report.confidenceAndCaveats,
    ]) {
      expect(section.length).toBeGreaterThan(0);
      expect(section.every((line) => typeof line === "string")).toBe(true);
    }
  });

  it("uses graceful fallback sentences when demand and competition are absent", () => {
    const card: TrendCard = {
      ...RETRO_HALLOWEEN_CATS_CARD,
      id: "empty-evidence",
      opportunityScore: 20,
      confidence: 0,
      availableSources: [],
      missingSources: [],
      trendSeries: [],
      competitors: undefined,
      productType: undefined,
    };

    expect(() =>
      buildOpportunityReport(card, deriveSellerInsights(card)),
    ).not.toThrow();

    const text = reportText(card);
    expect(text).toContain("Skip");
    expect(text).toContain("not enough trend history");
    expect(text).toContain("No competitor pricing");
    expect(text).toContain("No competitors were observed");
    expect(text).toContain("No source status was reported");
    expect(text).not.toMatch(/NaN|undefined/);
  });
});
