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

export const amazonAdapter: SourceAdapter = {
  source: "amazon",

  adapt(req) {
    return {
      type: "search",
      searchTerm: req.seed,
      market: req.market,
      productType: req.productType,
      startDate: req.window?.from,
      endDate: req.window?.to,
      maxResults: req.limit,
      mode: req.mode,
    };
  },

  normalize(providerOutput) {
    if (!isObject(providerOutput)) {
      console.warn("Malformed Amazon provider output");
      return [];
    }

    const { context, data } = providerOutput;
    if (!isContext(context) || !isObject(data)) {
      console.warn("Malformed Amazon provider output");
      return [];
    }

    const demand = isObject(data.demand) ? data.demand : {};
    const competition = isObject(data.competition) ? data.competition : {};
    const common = {
      source: "amazon" as const,
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
          bestSellerRank: finiteNumber(demand.bestSellerRank),
          competitors: competitors(data.products),
        },
      },
      {
        ...common,
        signalType: "competition",
        payload: {
          normalizedValue: normalizedValue(competition.normalizedValue),
          competitorCount: finiteNumber(competition.competitorCount),
        },
      },
    ];

    return records;
  },
};
