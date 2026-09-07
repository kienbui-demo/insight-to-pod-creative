import { describe, expect, it } from "vitest";

import type { CrawlRequest, UiEvent } from "../../../packages/contracts";
import { createSseStream } from "../../bff/sse-stream";
import type { LiveRun } from "../../bff/types";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import type { GenerateDesignImageInput } from "../ports";
import { FakeCrawlPort } from "./support/fake-crawl-port";
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

async function* decodeUiEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<UiEvent> {
  const contents = await new Response(stream).text();

  for (const frame of contents.replaceAll("\r\n", "\n").split("\n\n")) {
    const payload = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    if (payload.length > 0) {
      yield JSON.parse(payload) as UiEvent;
    }
  }
}

function collectUiEvents(run: LiveRun, runId: string): Promise<UiEvent[]> {
  return collectAsync(
    decodeUiEvents(
      createSseStream({
        runId,
        history: [],
        live: run.openEvents(),
      }),
    ),
  );
}

describe("ModelArk live-session tool-result deduplication", () => {
  it("submits and fetches a re-listed crawl tool use only once", async () => {
    const runId = "run-crawl-dedupe";
    const client = new FakeManagedAgentClient();
    const crawl = new FakeCrawlPort();
    const liveSessions = createModelArkLiveSessionPort({
      client,
      crawl,
      seedream: new FakeSeedreamImagePort(),
      maxImagesPerAction: 1,
    });
    const run = await liveSessions.create(runId);
    const collected = collectUiEvents(run, runId);

    await run.send({ kind: "deep-dive", crawl: CRAWL, question: "Go deeper" });
    client.session.events.push({
      id: "crawl-1",
      type: "agent.custom_tool_use",
      name: "crawl",
      input: { source: "pinterest" },
    });
    client.session.events.push({
      id: "idle-crawl-1",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["crawl-1"] },
    });
    client.session.events.push({
      id: "idle-crawl-duplicate",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["crawl-1"] },
    });
    client.session.events.push({
      id: "idle-crawl-end",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });

    const uiEvents = await collected;
    expect(
      client.session.submittedToolResults.filter(
        (event) =>
          event.type === "user.custom_tool_result" &&
          event.custom_tool_use_id === "crawl-1",
      ),
    ).toHaveLength(1);
    expect(crawl.calls).toHaveLength(1);
    expect(crawl.calls[0]?.input.source).toBe("pinterest");
    expect(uiEvents.some((event) => event.type === "done")).toBe(true);
    expect(
      uiEvents.some(
        (event) => event.type === "error" && event.recoverable === false,
      ),
    ).toBe(false);
  });

  it("generates and submits a re-listed image tool use only once", async () => {
    const runId = "run-image-dedupe";
    const client = new FakeManagedAgentClient();
    const seedream = new FakeSeedreamImagePort();
    const liveSessions = createModelArkLiveSessionPort({
      client,
      seedream,
      maxImagesPerAction: 1,
    });
    const run = await liveSessions.create(runId);
    const collected = collectUiEvents(run, runId);
    const input = {
      prompt: "Vintage botanical cat illustration",
      size: "2048x2048",
    } satisfies GenerateDesignImageInput;

    await run.send({ kind: "deep-dive", crawl: CRAWL, question: "Make a design" });
    client.session.events.push({
      id: "img-1",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input,
    });
    client.session.events.push({
      id: "idle-image-1",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["img-1"] },
    });
    client.session.events.push({
      id: "idle-image-duplicate",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["img-1"] },
    });
    client.session.events.push({
      id: "idle-image-end",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });

    const uiEvents = await collected;
    expect(seedream.calls).toHaveLength(1);
    expect(seedream.calls[0]?.input).toEqual(input);
    expect(
      client.session.submittedToolResults.filter(
        (event) =>
          event.type === "user.custom_tool_result" &&
          event.custom_tool_use_id === "img-1",
      ),
    ).toHaveLength(1);
    expect(uiEvents.some((event) => event.type === "done")).toBe(true);
    expect(
      uiEvents.some(
        (event) => event.type === "error" && event.recoverable === false,
      ),
    ).toBe(false);
  });
});
