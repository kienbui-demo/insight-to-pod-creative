import type {
  CanonicalRecord,
  SourceAdapter,
} from "../../../packages/contracts";
import {
  competitors,
  finiteNumber,
  isContext,
  isObject,
  normalizedValue,
} from "./normalization";

export const etsyAdapter: SourceAdapter = {
  source: "etsy",

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
      console.warn("Malformed Etsy provider output");
      return [];
    }

    const { context, data } = providerOutput;
    if (!isContext(context) || !isObject(data)) {
      console.warn("Malformed Etsy provider output");
      return [];
    }

    const demand = isObject(data.demand) ? data.demand : {};
    const price = isObject(data.price) ? data.price : {};
    const common = {
      source: "etsy" as const,
      market: context.market,
      seed: context.seed,
      capturedAt: context.capturedAt,
      rawRef: typeof context.rawRef === "string" ? context.rawRef : undefined,
    };
    const records: CanonicalRecord[] = [
      {
        ...common,
        signalType: "demand",
        payload: {
          normalizedValue: normalizedValue(demand.normalizedValue),
          searchVolume: finiteNumber(demand.searchVolume),
          rank: finiteNumber(demand.rank),
          competitors: competitors(data.listings),
        },
      },
      {
        ...common,
        signalType: "price",
        payload: {
          normalizedValue: normalizedValue(price.normalizedValue),
          minimumPrice: finiteNumber(price.minimumPrice),
          maximumPrice: finiteNumber(price.maximumPrice),
          medianPrice: finiteNumber(price.medianPrice),
        },
      },
    ];

    return records;
  },
};
