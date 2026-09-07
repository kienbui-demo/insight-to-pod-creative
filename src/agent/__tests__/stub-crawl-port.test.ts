import { afterEach, describe, expect, it, vi } from "vitest";

import type { CrawlSource } from "../../../packages/contracts";
import { stubCrawlPort } from "../stub-crawl-port";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stubCrawlPort", () => {
  it.each([
    ["google_trends", "culture"],
    ["reddit", "culture"],
    ["pinterest", "culture"],
    ["tiktok", "culture"],
    ["amazon", "demand"],
    ["etsy", "demand"],
    ["meta_ads", "ad"],
  ] as const satisfies readonly (readonly [CrawlSource, string])[])(
    "returns deterministic offline evidence for %s",
    async (source, signalType) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      await expect(
        stubCrawlPort.fetch({
          source,
          market: "US",
          seed: "retro halloween cats",
        }),
      ).resolves.toEqual({
        ok: true,
        records: [
          {
            source,
            market: "US",
            seed: "retro halloween cats",
            capturedAt: "2025-01-01T00:00:00.000Z",
            signalType,
            payload: { stub: true, transport: "offline" },
          },
        ],
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
