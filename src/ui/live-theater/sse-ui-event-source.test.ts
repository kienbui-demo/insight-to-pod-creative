import { describe, expect, it, vi } from "vitest";

import type { CrawlRequest, UiEvent } from "../../../packages/contracts";
import type { UiEventSource } from "./event-source";
import { createSseUiEventSource } from "./sse-ui-event-source";

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

const encoder = new TextEncoder();

function frame(event: unknown): string {
  const value = event as { id?: string; type?: string };
  return `id: ${value.id}\nevent: ${value.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function streamFromChunks(
  chunks: readonly string[],
  options: { failAfterChunks?: boolean; onCancel?: (reason: unknown) => void } = {},
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
        return;
      }
      if (options.failAfterChunks) {
        controller.error(new Error("stream interrupted"));
        return;
      }
      controller.close();
    },
    cancel(reason) {
      options.onCancel?.(reason);
    },
  });
}

async function collect(source: UiEventSource): Promise<UiEvent[]> {
  const events: UiEvent[] = [];
  for await (const event of source.events()) {
    events.push(event);
  }
  return events;
}

function requestBody(call: [RequestInfo | URL, RequestInit?]): {
  runId: string;
  reconnect: boolean;
} {
  return JSON.parse(String(call[1]?.body)) as {
    runId: string;
    reconnect: boolean;
  };
}

describe("C1 fetch-backed SSE UiEventSource", () => {
  it("parses validated events in order across arbitrary byte chunk boundaries", async () => {
    const scanning = {
      id: "event-1",
      type: "scanning",
      source: "reddit",
    } satisfies UiEvent;
    const synthesizing = {
      id: "event-2",
      type: "synthesizing",
      note: "Comparing sources",
    } satisfies UiEvent;
    const done = { id: "event-3", type: "done" } satisfies UiEvent;
    const wire = frame(scanning) + frame(synthesizing) + frame(done);
    const boundaries = [1, 7, 19, 43, wire.length - 3];
    const chunks: string[] = [];
    let previous = 0;
    for (const boundary of boundaries) {
      chunks.push(wire.slice(previous, boundary));
      previous = boundary;
    }
    chunks.push(wire.slice(previous));
    const fetch = vi.fn(async () =>
      new Response(streamFromChunks(chunks), {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
    );
    const source = createSseUiEventSource({
      url: "/api/live",
      runId: "run-chunks",
      request: { kind: "trend-card", crawl: CRAWL },
      fetch,
    }) satisfies UiEventSource;

    await expect(collect(source)).resolves.toEqual([
      scanning,
      synthesizing,
      done,
    ]);
  });

  it("rejects data that is not a valid frozen UiEvent", async () => {
    const invalid = {
      id: "invalid-event",
      type: "scanning",
      source: "not-a-crawl-source",
    };
    const fetch = vi.fn(async () =>
      new Response(streamFromChunks([frame(invalid)]), {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const source = createSseUiEventSource({
      url: "/api/live",
      runId: "run-invalid",
      request: { kind: "trend-card", crawl: CRAWL },
      fetch,
    });

    await expect(collect(source)).rejects.toThrow("Invalid UiEvent");
  });

  it("retries an interrupted stream with the same runId and reconnect true", async () => {
    const first = {
      id: "event-before-drop",
      type: "scanning",
      source: "reddit",
    } satisfies UiEvent;
    const resumed = {
      id: "event-after-reconnect",
      type: "synthesizing",
    } satisfies UiEvent;
    const done = { id: "run-retry:done", type: "done" } satisfies UiEvent;
    const fetch = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(streamFromChunks([frame(first)], { failAfterChunks: true }), {
          headers: { "content-type": "text/event-stream" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          streamFromChunks([frame(first) + frame(resumed) + frame(done)]),
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const source = createSseUiEventSource({
      url: "/api/live",
      runId: "run-retry",
      request: { kind: "trend-card", crawl: CRAWL },
      fetch,
      maxReconnects: 1,
    });

    await expect(collect(source)).resolves.toEqual([first, resumed, done]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody(fetch.mock.calls[0])).toEqual({
      runId: "run-retry",
      reconnect: false,
    });
    expect(requestBody(fetch.mock.calls[1])).toEqual({
      runId: "run-retry",
      reconnect: true,
    });
  });

  it("cancels the response reader when event iteration stops", async () => {
    const cancelled = vi.fn();
    const scanning = {
      id: "event-cancel",
      type: "scanning",
      source: "reddit",
    } satisfies UiEvent;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frame(scanning)));
      },
      cancel: cancelled,
    });
    const fetch = vi.fn(async () =>
      new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const source = createSseUiEventSource({
      url: "/api/live",
      runId: "run-cancel",
      request: { kind: "trend-card", crawl: CRAWL },
      fetch,
    });
    const iterator = source.events()[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: scanning,
    });
    await iterator.return?.();

    expect(cancelled).toHaveBeenCalledOnce();
  });
});
