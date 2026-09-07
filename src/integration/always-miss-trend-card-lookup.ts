import type { TrendCardLookupPort } from "../bff/types";

// F4/warehouse: replace with real cached trend-card lookup.
export const alwaysMissTrendCardLookup: TrendCardLookupPort = {
  async lookup() {
    return { kind: "miss" };
  },
};
