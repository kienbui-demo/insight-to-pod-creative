import type { CanonicalRecord, CrawlSource } from "../../packages/contracts";
import type { NormalizedOpportunityComponents } from "../scoring/opportunity-score";
import type { ComponentReduction } from "./types";

export const ALL_CRAWL_SOURCES: readonly CrawlSource[] = [
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
];

type ComponentName = keyof NormalizedOpportunityComponents;

const CULTURE_SOURCES = new Set<CrawlSource>([
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
]);

function componentFor(record: CanonicalRecord): ComponentName | undefined {
  if (
    (record.source === "amazon" || record.source === "etsy") &&
    record.signalType === "demand"
  ) {
    return "demand";
  }

  if (record.source === "meta_ads" && record.signalType === "ad") {
    return "provenIntent";
  }

  if (
    CULTURE_SOURCES.has(record.source) &&
    record.signalType === "culture"
  ) {
    return "earlyCulture";
  }

  if (
    (record.source === "amazon" && record.signalType === "competition") ||
    (record.source === "etsy" && record.signalType === "price")
  ) {
    return "competitionInverse";
  }

  return undefined;
}

function normalizedValue(record: CanonicalRecord): number | undefined {
  const value = record.payload.normalizedValue;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
}

export function reduceOpportunityComponents(
  records: readonly CanonicalRecord[],
): ComponentReduction {
  const values: Record<ComponentName, number[]> = {
    demand: [],
    provenIntent: [],
    earlyCulture: [],
    competitionInverse: [],
  };
  const contributing = new Set<CrawlSource>();

  for (const record of records) {
    const component = componentFor(record);
    const value = normalizedValue(record);

    if (component === undefined || value === undefined) {
      continue;
    }

    values[component].push(value);
    contributing.add(record.source);
  }

  const components: NormalizedOpportunityComponents = {};

  for (const component of Object.keys(values) as ComponentName[]) {
    const componentValues = values[component];
    if (componentValues.length > 0) {
      const mean =
        componentValues.reduce((sum, value) => sum + value, 0) /
        componentValues.length;
      components[component] = Math.round(mean * 1_000_000_000_000) / 1_000_000_000_000;
    }
  }

  return {
    components,
    contributingSources: ALL_CRAWL_SOURCES.filter((source) =>
      contributing.has(source),
    ),
  };
}
