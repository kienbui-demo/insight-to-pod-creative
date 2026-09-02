import { describe, expect, it } from "vitest";

import type { CrawlRequest, MetricSink } from "../../../packages/contracts";
import type { LiveRun, LiveSessionPort, RawMaEvent } from "../../bff/types";
import { COMPLETE_TREND_CARD } from "../__fixtures__/trend-card";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import type {
  GenerateDesignImageInput,
  GenerateDesignImageResult,
  ManagedAgentEvent,
} from "../ports";
import { FakeManagedAgentClient } from "./support/fake-managed-agent-client";
import { FakeSeedreamImagePort } from "./support/fake-seedream-image-port";
import { collectAsync } from "./support/manual-async-stream";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

async function createRun(options?: {
  seedreamResult?: GenerateDesignImageResult;
  metricSink?: MetricSink;
}): Promise<{
  run: LiveRun;
  client: FakeManagedAgentClient;
  seedream: FakeSeedreamImagePort;
}> {
  const client = new FakeManagedAgentClient();
  const seedream = new FakeSeedreamImagePort(options?.seedreamResult);
  const liveSessions = createModelArkLiveSessionPort({
    client,
    seedream,
    maxImagesPerAction: 1,
    metricSink: options?.metricSink,
  }) satisfies LiveSessionPort;
  const run = await liveSessions.create("run-tool-fulfillment");

  return { run, client, seedream };
}

describe("G4 ModelArk custom-tool fulfillment loop", () => {
  it("fulfills generate_design_image, submits its result, and emits it locally before the final card", async () => {
    const seedreamResult = {
      ok: true,
      url: "https://tos.example/generated/tool-loop.png",
    } as const satisfies GenerateDesignImageResult;
    const client = new FakeManagedAgentClient();
    const seedream = new FakeSeedreamImagePort(seedreamResult);
    const metricSink = {
      record(observation) {
        if (observation.name === "ptv_trend_card_build_total") {
          client.session.order.push("final-card");
        }
      },
    } satisfies MetricSink;
    const liveSessions = createModelArkLiveSessionPort({
      client,
      seedream,
      maxImagesPerAction: 1,
      metricSink,
    }) satisfies LiveSessionPort;
    const run = await liveSessions.create("run-design-tool-fulfillment");
    const collected = collectAsync(run.openEvents());
    const input = {
      prompt: "Blend these botanical references into a vintage print",
      size: "2048x2048",
      reference_image_sources: [
        { type: "url", url: "https://assets.example/botanical.png" },
        { type: "file", file_id: "file-botanical-001" },
      ],
    } as const satisfies GenerateDesignImageInput;
    const toolUse = {
      id: "tool-1",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input,
    } as const satisfies ManagedAgentEvent;
    const resultEvent = {
      id: "tool-1:result",
      type: "user.custom_tool_result",
      custom_tool_use_id: "tool-1",
      name: "generate_design_image",
      input,
      result: seedreamResult,
    } as const satisfies ManagedAgentEvent;

    await run.send({ kind: "generate-design", crawl: CRAWL });
    client.session.events.push(toolUse);
    client.session.events.push({
      id: "idle-requires-design",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["tool-1"] },
    });
    client.session.events.push({
      id: "final-design-card",
      type: "agent.output",
      output: { kind: "trend_card", card: COMPLETE_TREND_CARD },
    });
    client.session.events.push({
      id: "idle-end-turn",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });

    await expect(collected).resolves.toEqual([
      {
        id: "tool-1",
        type: "unmapped",
        name: "agent.custom_tool_use",
      } satisfies RawMaEvent,
      {
        id: "tool-1:result",
        type: "seedream_image",
        url: seedreamResult.url,
      } satisfies RawMaEvent,
      {
        id: "final-design-card",
        type: "final_card",
        card: COMPLETE_TREND_CARD,
      } satisfies RawMaEvent,
    ]);
    expect(seedream.calls).toHaveLength(1);
    expect(seedream.calls[0]?.input).toEqual(input);
    expect(client.session.submittedToolResults).toEqual([resultEvent]);
    expect(client.session.order.indexOf("tool-result")).toBeLessThan(
      client.session.order.indexOf("final-card"),
    );
  });

  it("leaves crawl fulfillment for F2 and closes on a later end_turn", async () => {
    const { run, client, seedream } = await createRun();
    const collected = collectAsync(run.openEvents());

    await run.send({ kind: "trend-card", crawl: CRAWL });
    client.session.events.push({
      id: "crawl-tool-1",
      type: "agent.custom_tool_use",
      name: "crawl",
      input: { source: "reddit" },
    });
    client.session.events.push({
      id: "idle-requires-crawl",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["crawl-tool-1"] },
    });
    client.session.events.push({
      id: "idle-after-crawl",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });

    await expect(collected).resolves.toEqual([
      {
        id: "crawl-tool-1",
        type: "tool_call",
        tool: "crawl",
        source: "reddit",
      } satisfies RawMaEvent,
    ]);
    expect(seedream.calls).toEqual([]);
    expect(client.session.submittedToolResults).toEqual([]);
  });

  it("keeps the plain end_turn path closing without emitted events", async () => {
    const { run, client, seedream } = await createRun();
    const collected = collectAsync(run.openEvents());

    await run.send({ kind: "trend-card", crawl: CRAWL });
    client.session.events.push({
      id: "idle-only-end-turn",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });

    await expect(collected).resolves.toEqual([]);
    expect(client.session.order.slice(0, 2)).toEqual(["open", "send"]);
    expect(seedream.calls).toEqual([]);
    expect(client.session.submittedToolResults).toEqual([]);
  });
});
