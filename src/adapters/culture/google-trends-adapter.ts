import type {
  CanonicalRecord,
  SourceAdapter,
} from "../../../packages/contracts";
import { isContext, isObject, normalizedValue } from "./normalization";

export const googleTrendsAdapter: SourceAdapter = {
  source: "google_trends",

  adapt(req) {
    return {
      keywords: [req.seed],
      geo: req.market,
      productType: req.productType,
      timeframe: req.window,
      limit: req.limit,
      mode: req.mode,
    };
  },

  normalize(providerOutput) {
    if (!isObject(providerOutput)) {
      console.warn("Malformed Google Trends provider output");
      return [];
    }

    const { context, data } = providerOutput;
    if (!isContext(context) || !isObject(data)) {
      console.warn("Malformed Google Trends provider output");
      return [];
    }

    const timeline = Array.isArray(data.timeline) ? data.timeline : [];
    const trendSeries = timeline.flatMap((point) => {
      if (
        !isObject(point) ||
        typeof point.date !== "string" ||
        typeof point.value !== "number" ||
        !Number.isFinite(point.value)
      ) {
        return [];
      }
      return [{ t: point.date, v: point.value }];
    });
    const record: CanonicalRecord = {
      source: "google_trends",
      market: context.market,
      seed: context.seed,
      capturedAt: context.capturedAt,
      signalType: "culture",
      payload: {
        normalizedValue: normalizedValue(data.normalizedValue),
        trendSeries,
      },
      rawRef: typeof context.rawRef === "string" ? context.rawRef : undefined,
    };

    return [record];
  },
};
