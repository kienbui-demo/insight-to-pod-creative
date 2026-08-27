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

export const redditAdapter: SourceAdapter = {
  source: "reddit",

  adapt(req) {
    return {
      query: req.seed,
      country: req.market,
      productType: req.productType,
      since: req.window?.from,
      until: req.window?.to,
      limit: req.limit,
      mode: req.mode,
    };
  },

  normalize(providerOutput) {
    if (!isObject(providerOutput)) {
      console.warn("Malformed Reddit provider output");
      return [];
    }

    const { context, data } = providerOutput;
    if (!isContext(context) || !isObject(data)) {
      console.warn("Malformed Reddit provider output");
      return [];
    }

    const record: CanonicalRecord = {
      source: "reddit",
      market: context.market,
      seed: context.seed,
      capturedAt: context.capturedAt,
      signalType: "culture",
      payload: {
        normalizedValue: normalizedValue(data.normalizedValue),
        mentionCount: finiteNumber(data.mentionCount),
        engagementCount: finiteNumber(data.engagementCount),
      },
      rawRef: typeof context.rawRef === "string" ? context.rawRef : undefined,
    };

    return [record];
  },
};
