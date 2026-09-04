import type { ApifyActorEntry } from "../apify-crawl-port";

export const GOOGLE_TRENDS_ACTOR_SLUG =
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

export function createGoogleTrendsEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: GOOGLE_TRENDS_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => {
      const market = input.market.toUpperCase();
      const geo =
        input.market === "" ||
        market === "WW" ||
        market === "WORLD" ||
        market === "WORLDWIDE" ||
        market === "GLOBAL"
          ? ""
          : input.market;

      return {
        searchTerms: [input.seed],
        geo,
        timeRange: "today 12-m",
        surfaces: ["interestOverTime"],
      };
    },
    normalize: (items, input) => {
      const row = items
        .filter(isPlainObject)
        .find((item) => item.surface === "interestOverTime");

      if (row === undefined || !isPlainObject(row.data)) {
        return [];
      }

      const points = Array.isArray(row.data.points) ? row.data.points : [];
      const trendSeries = points.flatMap((point) => {
        if (!isPlainObject(point) || typeof point.date !== "string") {
          return [];
        }

        const value = finiteNumber(point.value);
        return value === undefined ? [] : [{ t: point.date, v: value }];
      });

      if (trendSeries.length === 0) {
        return [];
      }

      const pointCount = trendSeries.length;
      const recentPoints = trendSeries.slice(-Math.min(3, pointCount));
      const average =
        recentPoints.reduce((sum, point) => sum + point.v, 0) /
        recentPoints.length;
      const normalizedValue = clamp01(average / 100);

      return [
        {
          source: "google_trends",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "culture",
          payload: {
            pointCount,
            normalizedValue,
            trendSeries,
          },
        },
      ];
    },
  };
}
