import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TrendCard } from "../../../packages/contracts";
import { TrendCardGrid } from "./trend-card-grid";

const A = {
  id: "trend-bookish-winter-club",
  market: "DE",
  seed: "bookish winter club",
  opportunityScore: 69,
  confidence: 1,
  availableSources: [],
  missingSources: [],
  trendSeries: [],
  referenceImages: [],
  recommendation: { action: "Test", reasoning: "Evidence" },
  freshnessTier: "hot",
  updatedAt: "2026-08-31T00:00:00.000Z",
} satisfies TrendCard;

const B = {
  id: "trend-retro-halloween-cats",
  market: "US",
  seed: "retro halloween cats",
  opportunityScore: 84,
  confidence: 1,
  availableSources: [],
  missingSources: [],
  trendSeries: [],
  referenceImages: [],
  recommendation: { action: "Test", reasoning: "Evidence" },
  freshnessTier: "hot",
  updatedAt: "2026-08-31T00:00:00.000Z",
} satisfies TrendCard;

const C = {
  id: "trend-coastal-grandma-christmas",
  market: "US",
  seed: "coastal grandma christmas",
  opportunityScore: 76,
  confidence: 1,
  availableSources: [],
  missingSources: [],
  trendSeries: [],
  referenceImages: [],
  recommendation: { action: "Test", reasoning: "Evidence" },
  freshnessTier: "hot",
  updatedAt: "2026-08-31T00:00:00.000Z",
} satisfies TrendCard;

describe("TrendCardGrid", () => {
  it("renders trend cards ranked by opportunityScore descending, regardless of input order", () => {
    const shuffled = [A, B, C];

    render(<TrendCardGrid cards={shuffled} />);

    const seeds = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(seeds).toEqual([
      "retro halloween cats",
      "coastal grandma christmas",
      "bookish winter club",
    ]);
  });
});
