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

export const tiktokAdapter: SourceAdapter = {
  source: "tiktok",

  adapt(req) {
    return {
      searchQuery: req.seed,
      region: req.market,
      productType: req.productType,
      startDate: req.window?.from,
      endDate: req.window?.to,
      maxResults: req.limit,
      mode: req.mode,
    };
  },

  normalize(providerOutput) {
    if (!isObject(providerOutput)) {
      console.warn("Malformed TikTok provider output");
      return [];
    }

    const { context, data } = providerOutput;
    if (!isContext(context) || !isObject(data)) {
      console.warn("Malformed TikTok provider output");
      return [];
    }

    const record: CanonicalRecord = {
      source: "tiktok",
      market: context.market,
      seed: context.seed,
      capturedAt: context.capturedAt,
      signalType: "culture",
      payload: {
        normalizedValue: normalizedValue(data.normalizedValue),
        videoCount: finiteNumber(data.videoCount),
        viewCount: finiteNumber(data.viewCount),
        referenceImageUrls: imageUrls(data.images),
      },
      rawRef: typeof context.rawRef === "string" ? context.rawRef : undefined,
    };

    return [record];
  },
};
