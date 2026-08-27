import type {
  CanonicalRecord,
  SourceAdapter,
} from "../../../packages/contracts";
import {
  finiteNumber,
  imageUrls,
  isContext,
  isObject,
  normalizedValue,
} from "./normalization";

export const pinterestAdapter: SourceAdapter = {
  source: "pinterest",

  adapt(req) {
    return {
      query: req.seed,
      country: req.market,
      productType: req.productType,
      startDate: req.window?.from,
      endDate: req.window?.to,
      limit: req.limit,
      mode: req.mode,
    };
  },

  normalize(providerOutput) {
    if (!isObject(providerOutput)) {
      console.warn("Malformed Pinterest provider output");
      return [];
    }

    const { context, data } = providerOutput;
    if (!isContext(context) || !isObject(data)) {
      console.warn("Malformed Pinterest provider output");
      return [];
    }

    const record: CanonicalRecord = {
      source: "pinterest",
      market: context.market,
      seed: context.seed,
      capturedAt: context.capturedAt,
      signalType: "culture",
      payload: {
        normalizedValue: normalizedValue(data.normalizedValue),
        pinCount: finiteNumber(data.pinCount),
        saveCount: finiteNumber(data.saveCount),
        referenceImageUrls: imageUrls(data.images),
      },
      rawRef: typeof context.rawRef === "string" ? context.rawRef : undefined,
    };

    return [record];
  },
};
