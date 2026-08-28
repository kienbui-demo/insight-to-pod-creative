import { describe, expect, it } from "vitest";

import type { CrawlSource } from "../../packages/contracts";
import {
  formatCompetitorPrice,
  formatConfidence,
  formatCrawlSource,
  formatDate,
  formatOpportunityScore,
} from "./formatters";

describe("UI formatters", () => {
  it.each([
    ["google_trends", "Google Trends"],
    ["reddit", "Reddit"],
    ["pinterest", "Pinterest"],
    ["tiktok", "TikTok"],
    ["amazon", "Amazon"],
    ["etsy", "Etsy"],
    ["meta_ads", "Meta Ads"],
  ] satisfies ReadonlyArray<readonly [CrawlSource, string]>) (
    "formats the %s crawl source label",
    (source, expected) => {
      expect(formatCrawlSource(source)).toBe(expected);
    },
  );

  it("formats confidence as a rounded percentage", () => {
    expect(formatConfidence(0.914)).toBe("91%");
  });

  it("formats an opportunity score on its 100-point scale", () => {
    expect(formatOpportunityScore(84.4)).toBe("84/100");
  });

  it("formats ISO dates deterministically in UTC", () => {
    expect(formatDate("2026-08-28T23:30:00.000Z")).toBe("Aug 28, 2026");
  });

  it("formats a present competitor price in USD", () => {
    expect(formatCompetitorPrice(24.99)).toBe("$24.99");
  });

  it("returns null when the optional competitor price is omitted", () => {
    expect(formatCompetitorPrice(undefined)).toBeNull();
  });
});
