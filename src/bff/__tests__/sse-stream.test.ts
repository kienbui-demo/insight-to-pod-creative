import { describe, expect, it, vi } from "vitest";

import type { RawMaEvent } from "../types";
import { createSseStream } from "../sse-stream";
import {
  ControllableAsyncEvents,
  readOneFrame,
  readRemaining,
} from "./support/async-events";

function finiteEvents(events: readonly RawMaEvent[]): AsyncIterable<RawMaEvent> {
  return (async function* () {
    yield* events;
  })();
}

describe("in-memory SSE stream", () => {
  it("delivers a partial frame before the upstream stream completes", async () => {
    const live = new ControllableAsyncEvents<RawMaEvent>();
    const stream = createSseStream({ runId: "run-partial", history: [], live });
    const reader = stream.getReader();

    live.push({
      id: "scan-1",
      type: "tool_call",
      tool: "crawl",
      source: "reddit",
    });

    await expect(readOneFrame(reader)).resolves.toContain("event: scanning\n");
    live.end();
    await expect(readRemaining(reader)).resolves.toContain(
      "id: run-partial:done\nevent: done\n",
    );
  });

  it("replays ordered history then emits only unseen live ids", async () => {
    const history: RawMaEvent[] = [
      {
        id: "one",
        type: "tool_call",
        tool: "crawl",
        source: "reddit",
      },
      { id: "two", type: "synthesis_chunk", note: "Working" },
    ];
    const live: RawMaEvent[] = [
      history[1],
      { id: "three", type: "seedream_image", url: "https://tos/new.png" },
    ];

    const text = await new Response(
      createSseStream({
        runId: "run-reconnect",
        history,
        live: finiteEvents(live),
      }),
    ).text();

    expect(text.match(/id: one\n/g)).toHaveLength(1);
    expect(text.match(/id: two\n/g)).toHaveLength(1);
    expect(text.match(/id: three\n/g)).toHaveLength(1);
    expect(text.indexOf("id: one\n")).toBeLessThan(text.indexOf("id: two\n"));
    expect(text.indexOf("id: two\n")).toBeLessThan(text.indexOf("id: three\n"));
    expect(text).toContain("id: run-reconnect:done\nevent: done\n");
  });

  it("emits a recoverable error, continues, then emits deterministic done", async () => {
    const live: RawMaEvent[] = [
      {
        id: "error-1",
        type: "error",
        recoverable: true,
        message: "TikTok unavailable",
      },
      { id: "progress-2", type: "synthesis_chunk", note: "Using other sources" },
    ];

    const text = await new Response(
      createSseStream({
        runId: "stable-run-id",
        history: [],
        live: finiteEvents(live),
      }),
    ).text();

    expect(text.indexOf("id: error-1\n")).toBeLessThan(
      text.indexOf("id: progress-2\n"),
    );
    expect(text).toContain('"recoverable":true');
    expect(text).toContain("id: stable-run-id:done\nevent: done\n");
  });

  it("emits an unrecoverable error and closes without done or later events", async () => {
    const live: RawMaEvent[] = [
      {
        id: "fatal",
        type: "error",
        recoverable: false,
        message: "Session terminated",
      },
      { id: "must-not-appear", type: "synthesis_chunk" },
    ];

    const text = await new Response(
      createSseStream({ runId: "fatal-run", history: [], live: finiteEvents(live) }),
    ).text();

    expect(text).toContain("event: error\n");
    expect(text).toContain('"recoverable":false');
    expect(text).not.toContain("event: done\n");
    expect(text).not.toContain("must-not-appear");
  });

  it("turns an upstream throw into an unrecoverable event without leaking a stream error", async () => {
    const live = new ControllableAsyncEvents<RawMaEvent>();
    const textPromise = new Response(
      createSseStream({ runId: "throw-run", history: [], live }),
    ).text();

    live.fail(new Error("connection reset"));
    const text = await textPromise;

    expect(text).toContain("event: error\n");
    expect(text).toContain('"recoverable":false');
    expect(text).toContain("connection reset");
    expect(text).not.toContain("event: done\n");
  });

  it("emits done only once when history already contains its deterministic id", async () => {
    const text = await new Response(
      createSseStream({
        runId: "same-run",
        history: [{ id: "same-run:done", type: "unmapped", name: "old-end" }],
        live: finiteEvents([]),
      }),
    ).text();

    expect(text.match(/id: same-run:done\n/g)).toHaveLength(1);
  });

  it("propagates client cancellation and does not fabricate a terminal event", async () => {
    const live = new ControllableAsyncEvents<RawMaEvent>();
    const onCancel = vi.fn(async () => undefined);
    const stream = createSseStream({
      runId: "cancel-run",
      history: [],
      live,
      onCancel,
    });
    const reader = stream.getReader();

    live.push({ id: "progress", type: "synthesis_chunk" });
    const first = await readOneFrame(reader);
    await reader.cancel("client disconnected");

    expect(first).toContain("event: synthesizing\n");
    expect(first).not.toContain("event: done\n");
    expect(onCancel).toHaveBeenCalledWith("client disconnected");
    expect(live.iteratorReturn).toHaveBeenCalledOnce();
  });
});
