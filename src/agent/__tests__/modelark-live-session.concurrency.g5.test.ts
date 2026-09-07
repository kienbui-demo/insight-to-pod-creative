import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import type { RawMaEvent } from "../../bff/types";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import type {
  GenerateDesignImageInput,
  GenerateDesignImageResult,
  ManagedAgentEvent,
  SeedreamImagePort,
} from "../ports";
import { FakeManagedAgentClient } from "./support/fake-managed-agent-client";
import { collectAsync } from "./support/manual-async-stream";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

class ControllableSeedreamImagePort implements SeedreamImagePort {
  readonly calls: Array<{
    input: GenerateDesignImageInput;
    resolve: (result: GenerateDesignImageResult) => void;
  }> = [];

  generate(
    input: GenerateDesignImageInput,
  ): Promise<GenerateDesignImageResult> {
    return new Promise((resolve) => {
      this.calls.push({ input, resolve });
    });
  }
}

describe("G5 ModelArk image-tool fulfillment concurrency", () => {
  it("starts every image generation concurrently and submits mapped results in event_ids order", async () => {
    const client = new FakeManagedAgentClient();
    const seedream = new ControllableSeedreamImagePort();
    const liveSessions = createModelArkLiveSessionPort({
      client,
      seedream,
      maxImagesPerAction: 1,
    });
    const run = await liveSessions.create("run-concurrent-image-tools");
    const collected = collectAsync(run.openEvents());
    const input1 = {
      prompt: "First design",
      size: "2048x2048",
    } satisfies GenerateDesignImageInput;
    const input2 = {
      prompt: "Second design",
      size: "2048x2048",
    } satisfies GenerateDesignImageInput;
    const result1 = {
      ok: true,
      url: "https://tos.example/generated/tool-1.png",
    } as const satisfies GenerateDesignImageResult;
    const result2 = {
      ok: true,
      url: "https://tos.example/generated/tool-2.png",
    } as const satisfies GenerateDesignImageResult;

    await run.send({ kind: "generate-design", crawl: CRAWL });
    client.session.events.push({
      id: "tool-1",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input: input1,
    });
    client.session.events.push({
      id: "tool-2",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input: input2,
    });
    client.session.events.push({
      id: "idle-requires-images",
      type: "session.status_idle",
      stop_reason: {
        type: "requires_action",
        event_ids: ["tool-1", "tool-2"],
      },
    });
    client.session.events.push({
      id: "idle-end-turn",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });

    await vi.waitFor(() => expect(seedream.calls).toHaveLength(2));
    expect(client.session.submittedToolResults).toEqual([]);

    seedream.calls[1]!.resolve(result2);
    await Promise.resolve();
    expect(client.session.submittedToolResults).toEqual([]);

    seedream.calls[0]!.resolve(result1);
    const output = await collected;

    expect(client.session.submittedToolResults).toEqual([
      {
        id: "tool-1:result",
        type: "user.custom_tool_result",
        custom_tool_use_id: "tool-1",
        name: "generate_design_image",
        input: input1,
        result: result1,
      },
      {
        id: "tool-2:result",
        type: "user.custom_tool_result",
        custom_tool_use_id: "tool-2",
        name: "generate_design_image",
        input: input2,
        result: result2,
      },
    ] satisfies ManagedAgentEvent[]);
    expect(
      output.filter((event) => event.type === "seedream_image"),
    ).toEqual([
      {
        id: "tool-1:result",
        type: "seedream_image",
        url: result1.url,
      },
      {
        id: "tool-2:result",
        type: "seedream_image",
        url: result2.url,
      },
    ] satisfies RawMaEvent[]);
  });
});
