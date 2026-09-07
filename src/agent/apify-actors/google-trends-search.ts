import type { ApifyActorEntry } from "../apify-crawl-port";

export const GOOGLE_TRENDS_SEARCH_ACTOR_SLUG =
  "steadyfetch/google-trends-scraper";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function createGoogleTrendsSearchEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: GOOGLE_TRENDS_SEARCH_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      searchTerms: [input.seed],
      geo: input.market,
      timeRange: "today 12-m",
      surfaces: ["interestOverTime"],
    }),
    normalize: (items, input) => {
      const rows = items.filter(isPlainObject);
      const row = rows.find(
        (candidate) =>
          candidate.surface === "interestOverTime" &&
          isPlainObject(candidate.data) &&
          Array.isArray(candidate.data.points),
      );

      if (!row || !isPlainObject(row.data) || !Array.isArray(row.data.points)) {
        return [];
      }

      const trendSeries = row.data.points
        .filter(isPlainObject)
        .map((point) => ({
          t: typeof point.date === "string" ? point.date : undefined,
          v: finiteNumber(point.value),
        }))
        .filter(
          (point): point is { t: string; v: number } =>
            point.t !== undefined && point.v !== undefined,
        );

      const resultCount = trendSeries.length;
      if (resultCount === 0) {
        return [];
      }

      const values = trendSeries.map((point) => point.v);
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
      const latestValue = values[values.length - 1];
      const recentWindow = values.slice(-3);
      const recentAvg =
        recentWindow.reduce((sum, v) => sum + v, 0) / recentWindow.length;
      const normalizedValue = clamp01(recentAvg / 100);

      return [
        {
          source: "google_trends",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "culture",
          payload: {
            resultCount,
            minValue,
            maxValue,
            avgValue,
            latestValue,
            trendSeries,
            normalizedValue,
          },
        },
      ];
    },
  };
}
