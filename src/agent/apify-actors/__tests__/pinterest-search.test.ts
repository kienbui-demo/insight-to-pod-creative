import { describe, expect, it } from "vitest";

import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/pinterest-search.dataset.json";
import { createPinterestSearchEntry } from "../pinterest-search";

const entry = createPinterestSearchEntry({
  now: () => "2026-09-04T00:00:00.000Z",
});
const input: CrawlPortInput = {
  source: "pinterest",
  market: "US",
  seed: "interior design ideas",
  limit: 5,
};

describe("createPinterestSearchEntry", () => {
  it("builds the exact Pinterest actor input", () => {
    expect(entry.buildInput(input)).toEqual({
      keywords: ["interior design ideas"],
      maxItems: 5,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    });
  });

  it("normalizes the fixture into one aggregated culture record", () => {
    const records = entry.normalize(fixture, input);

    expect(records.length).toBe(1);
    const [record] = records;
    expect(record.source).toBe("pinterest");
    expect(record.market).toBe("US");
    expect(record.seed).toBe("interior design ideas");
    expect(record.capturedAt).toBe("2026-09-04T00:00:00.000Z");
    expect(record.signalType).toBe("culture");
    expect(record.payload.resultCount).toBe(5);
    expect(record.payload.distinctDomains).toBe(5);
    expect(record.payload.distinctBoards).toBe(5);
    expect(record.payload.totalRepins).toBe(0);
    expect(record.payload.engagementScore).toBe(0);
    expect(record.payload.reachScore).toBeCloseTo(
      0.25938375012788123,
      12,
    );
    expect(record.payload.normalizedValue).toBeCloseTo(
      0.18156862508951685,
      12,
    );
  });
});
