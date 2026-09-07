import { describe, expect, it } from "vitest";

import type { MetricSink } from "../../../packages/contracts";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import { FakeCrawlPort } from "./support/fake-crawl-port";
import { FakeManagedAgentClient } from "./support/fake-managed-agent-client";
import { FakeSeedreamImagePort } from "./support/fake-seedream-image-port";

describe("S3 seller prompt pass-through", () => {
  it("forwards sellerPrompt to the Managed Agent session unchanged", async () => {
    const client = new FakeManagedAgentClient();
    const metricSink = {
      record() {},
    } satisfies MetricSink;
    const sessions = createModelArkLiveSessionPort({
      client,
      crawl: new FakeCrawlPort([{ ok: true, records: [] }]),
      seedream: new FakeSeedreamImagePort(),
      maxImagesPerAction: 1,
      metricSink,
    });
    const run = await sessions.create("run-seller-prompt");

    await run.send({
      kind: "generate-design",
      crawl: {
        source: "google_trends",
        market: "US",
        seed: "retro halloween cats",
        productType: "t-shirt",
        mode: "live",
      },
      sellerPrompt: "make it neon",
    });

    const sent = client.session.sent;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: "generate-design",
      sellerPrompt: "make it neon",
    });
  });
});
