import type {
  CanonicalRecord,
  SourceAdapter,
} from "../../../packages/contracts";
import {
  finiteNumber,
  isContext,
  isObject,
  normalizedValue,
} from "./normalization";

export const metaAdsAdapter: SourceAdapter = {
  source: "meta_ads",

  adapt(req) {
    return {
      searchQuery: req.seed,
      country: req.market,
      productType: req.productType,
      startDate: req.window?.from,
      endDate: req.window?.to,
      maxResults: req.limit,
      mode: req.mode,
    };
  },

  normalize(providerOutput) {
    if (!isObject(providerOutput)) {
      console.warn("Malformed Meta Ads provider output");
      return [];
    }

    const { context, data } = providerOutput;
    if (!isContext(context) || !isObject(data)) {
      console.warn("Malformed Meta Ads provider output");
      return [];
    }

    const ad = isObject(data.ad) ? data.ad : {};
    const record: CanonicalRecord = {
      source: "meta_ads",
      market: context.market,
      seed: context.seed,
      capturedAt: context.capturedAt,
      signalType: "ad",
      payload: {
        normalizedValue: normalizedValue(ad.normalizedValue),
        activeAdCount: finiteNumber(ad.activeAdCount),
        longestActiveDays: finiteNumber(ad.longestActiveDays),
      },
      rawRef: typeof context.rawRef === "string" ? context.rawRef : undefined,
    };

    return [record];
  },
};
