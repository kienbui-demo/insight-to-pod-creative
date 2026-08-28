import { describe, expect, it } from "vitest";

import type { CrawlRequest, CrawlSource } from "../../../packages/contracts";
import type { LiveRun, LiveSessionPort, RawMaEvent } from "../../bff/types";
import { sourceFailureTurn } from "../__fixtures__/managed-agent-events";
import {
  ALL_CRAWL_SOURCES,
  COMPLETE_TREND_CARD,
  PARTIAL_CONFIDENCE_BY_SOURCE,
  trendCardMissing,
} from "../__fixtures__/trend-card";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import { FakeManagedAgentClient } from "./support/fake-managed-agent-client";
import { FakeSeedreamImagePort } from "./support/fake-seedream-image-port";
import { collectAsync } from "./support/manual-async-stream";

const BASE_CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

const OTHER_SOURCES = ALL_CRAWL_SOURCES.filter(
  (source): source is Exclude<CrawlSource, "tiktok"> => source !== "tiktok",
);

async function runWithSourceFailure(source: CrawlSource): Promise<{
  events: RawMaEvent[];
  client: FakeManagedAgentClient;
  seedream: FakeSeedreamImagePort;
}> {
  const client = new FakeManagedAgentClient();
  const seedream = new FakeSeedreamImagePort();
  const liveSessions = createModelArkLiveSessionPort({
    client,
    seedream,
    maxImagesPerAction: 1,
  }) satisfies LiveSessionPort;

  const run: LiveRun = await liveSessions.create(`run-missing-${source}`);
  const collected = collectAsync(run.openEvents());

  await run.send({
    kind: "trend-card",
    crawl: { ...BASE_CRAWL, source },
  });

  for (const event of sourceFailureTurn(source, trendCardMissing(source))) {
    client.session.events.push(event);
  }

  return { events: await collected, client, seedream };
}

describe("G5 ModelArk live session degradation", () => {
  it("continues after TikTok fails, emits a partial card, then closes the iterator", async () => {
    const { events, client, seedream } = await runWithSourceFailure("tiktok");
    const partialCard = trendCardMissing("tiktok");

    expect(events).toEqual([
      {
        id: "ma-tiktok-error",
        type: "error",
        recoverable: true,
        message: "tiktok unavailable; continuing with remaining sources",
      } satisfies RawMaEvent,
      {
        id: "ma-tiktok-card",
        type: "final_card",
        card: partialCard,
      } satisfies RawMaEvent,
    ]);
    expect(partialCard.missingSources).toContain("tiktok");
    expect(partialCard.confidence).toBe(PARTIAL_CONFIDENCE_BY_SOURCE.tiktok);
    expect(partialCard.confidence).toBeLessThan(COMPLETE_TREND_CARD.confidence);
    expect(client.session.order.slice(0, 2)).toEqual(["open", "send"]);
    expect(seedream.calls).toEqual([]);
  });

  it.each(OTHER_SOURCES)(
    "isolates a %s failure and still returns a reduced-confidence card",
    async (source) => {
      const { events } = await runWithSourceFailure(source);
      const partialCard = trendCardMissing(source);

      expect(events).toEqual([
        {
          id: `ma-${source}-error`,
          type: "error",
          recoverable: true,
          message: `${source} unavailable; continuing with remaining sources`,
        } satisfies RawMaEvent,
        {
          id: `ma-${source}-card`,
          type: "final_card",
          card: partialCard,
        } satisfies RawMaEvent,
      ]);
      expect(partialCard.missingSources).toEqual([source]);
      expect(partialCard.availableSources).not.toContain(source);
      expect(partialCard.confidence).toBe(PARTIAL_CONFIDENCE_BY_SOURCE[source]);
      expect(partialCard.confidence).toBeLessThan(COMPLETE_TREND_CARD.confidence);
    },
  );
});
