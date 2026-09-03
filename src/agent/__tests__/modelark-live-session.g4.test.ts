import { describe, expect, it } from "vitest";

import type {
  CrawlRequest,
  MetricObservation,
  MetricSink,
} from "../../../packages/contracts";
import type { LiveRun, LiveSessionPort, RawMaEvent } from "../../bff/types";
import {
  COMPLETE_TREND_CARD,
  trendCardMissing,
} from "../__fixtures__/trend-card";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import type {
  CrawlPortResult,
  GenerateDesignImageInput,
  GenerateDesignImageResult,
  ManagedAgentEvent,
} from "../ports";
import { FakeManagedAgentClient } from "./support/fake-managed-agent-client";
import { FakeCrawlPort } from "./support/fake-crawl-port";
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

  it("fulfills crawl with the tool source plus request context before emitting the final card", async () => {
    const crawlRequest = {
      ...CRAWL,
      window: { from: "2025-01-01", to: "2025-01-31" },
      limit: 25,
    } satisfies CrawlRequest;
    const crawlResult = {
      ok: true,
      records: [
        {
          source: "reddit",
          market: "US",
          seed: "retro halloween cats",
          capturedAt: "2025-01-15T00:00:00.000Z",
          signalType: "culture",
          payload: { mentions: 120 },
        },
      ],
    } as const satisfies CrawlPortResult;
    const client = new FakeManagedAgentClient();
    const crawl = new FakeCrawlPort([crawlResult]);
    const seedream = new FakeSeedreamImagePort();
    const metricSink = {
      record(observation) {
        if (observation.name === "ptv_trend_card_build_total") {
          client.session.order.push("final-card");
        }
      },
    } satisfies MetricSink;
    const options = {
      client,
      crawl,
      seedream,
      maxImagesPerAction: 1,
      metricSink,
    } as const;
    const liveSessions = createModelArkLiveSessionPort(options);
    const run = await liveSessions.create("run-crawl-tool-fulfillment");
    const collected = collectAsync(run.openEvents());
    const toolUse = {
      id: "crawl-tool-1",
      type: "agent.custom_tool_use",
      name: "crawl",
      input: { source: "reddit" },
    } as const satisfies ManagedAgentEvent;
    const resultEvent = {
      id: "crawl-tool-1:result",
      type: "user.custom_tool_result",
      custom_tool_use_id: "crawl-tool-1",
      name: "crawl",
      input: { source: "reddit" },
      result: crawlResult,
    } as const satisfies ManagedAgentEvent;

    await run.send({ kind: "trend-card", crawl: crawlRequest });
    client.session.events.push(toolUse);
    client.session.events.push({
      id: "idle-requires-crawl",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["crawl-tool-1"] },
    });
    client.session.events.push({
      id: "final-crawl-card",
      type: "agent.output",
      output: { kind: "trend_card", card: COMPLETE_TREND_CARD },
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
      {
        id: "crawl-tool-1:result",
        type: "unmapped",
        name: "user.custom_tool_result",
      } satisfies RawMaEvent,
      {
        id: "final-crawl-card",
        type: "final_card",
        card: COMPLETE_TREND_CARD,
      } satisfies RawMaEvent,
    ]);
    expect(crawl.calls).toEqual([
      {
        input: {
          source: "reddit",
          market: "US",
          seed: "retro halloween cats",
          productType: "t-shirt",
          window: { from: "2025-01-01", to: "2025-01-31" },
          limit: 25,
        },
        signal: undefined,
      },
    ]);
    expect(seedream.calls).toEqual([]);
    expect(client.session.submittedToolResults).toEqual([resultEvent]);
    expect(client.session.order.indexOf("tool-result")).toBeLessThan(
      client.session.order.indexOf("final-card"),
    );
  });

  it.each([
    {
      label: "recoverable failure",
      source: "reddit",
      result: {
        ok: false,
        recoverable: true,
        message: "Reddit crawl timed out",
      },
      expectedOutcome: "failure",
    },
    {
      label: "best-effort empty result",
      source: "pinterest",
      result: { ok: true, records: [] },
      expectedOutcome: "empty",
    },
    {
      label: "priority meta_ads failure",
      source: "meta_ads",
      result: {
        ok: false,
        recoverable: true,
        message: "Meta Ads returned 503",
      },
      expectedOutcome: "failure",
    },
  ] as const satisfies readonly {
    label: string;
    source: "reddit" | "pinterest" | "meta_ads";
    result: CrawlPortResult;
    expectedOutcome: "failure" | "empty";
  }[])(
    "continues to a partial final card after $label",
    async ({ source, result, expectedOutcome }) => {
      const client = new FakeManagedAgentClient();
      const crawl = new FakeCrawlPort([result]);
      const seedream = new FakeSeedreamImagePort();
      const observations: MetricObservation[] = [];
      const metricSink = {
        record(observation) {
          observations.push(observation);
        },
      } satisfies MetricSink;
      const options = {
        client,
        crawl,
        seedream,
        maxImagesPerAction: 1,
        metricSink,
      } as const;
      const liveSessions = createModelArkLiveSessionPort(options);
      const run = await liveSessions.create(`run-crawl-${source}`);
      const collected = collectAsync(run.openEvents());
      const card = trendCardMissing(source);

      await run.send({ kind: "trend-card", crawl: CRAWL });
      client.session.events.push({
        id: `crawl-tool-${source}`,
        type: "agent.custom_tool_use",
        name: "crawl",
        input: { source },
      });
      client.session.events.push({
        id: `idle-requires-${source}`,
        type: "session.status_idle",
        stop_reason: {
          type: "requires_action",
          event_ids: [`crawl-tool-${source}`],
        },
      });
      client.session.events.push({
        id: `final-card-${source}`,
        type: "agent.output",
        output: { kind: "trend_card", card },
      });
      client.session.events.push({
        id: `idle-end-${source}`,
        type: "session.status_idle",
        stop_reason: { type: "end_turn" },
      });

      await expect(collected).resolves.toEqual([
        {
          id: `crawl-tool-${source}`,
          type: "tool_call",
          tool: "crawl",
          source,
        },
        {
          id: `crawl-tool-${source}:result`,
          type: "unmapped",
          name: "user.custom_tool_result",
        },
        {
          id: `final-card-${source}`,
          type: "final_card",
          card,
        },
      ] satisfies RawMaEvent[]);
      expect(client.session.submittedToolResults).toEqual([
        {
          id: `crawl-tool-${source}:result`,
          type: "user.custom_tool_result",
          custom_tool_use_id: `crawl-tool-${source}`,
          name: "crawl",
          input: { source },
          result,
        } satisfies ManagedAgentEvent,
      ]);
      expect(crawl.calls).toHaveLength(1);
      expect(
        observations.find(
          (observation) =>
            observation.name === "ptv_crawl_source_run_total" &&
            observation.labels.source === source,
        ),
      ).toEqual(
        expect.objectContaining({
          labels: expect.objectContaining({ outcome: expectedOutcome }),
        }),
      );
    },
  );

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
