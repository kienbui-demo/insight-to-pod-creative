import { describe, expect, it, vi } from "vitest";

import type { MetricSink } from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import { createSseStream } from "../sse-stream";
import type { RawMaEvent } from "../types";
import {
  ControllableAsyncEvents,
  readOneFrame,
} from "./support/async-events";

function finiteEvents(events: readonly RawMaEvent[]): AsyncIterable<RawMaEvent> {
  return (async function* () {
    yield* events;
  })();
}

describe("BFF SSE C8 monitoring", () => {
  it("records emitted, deduplicated, unmapped, and done events without changing G4 output", async () => {
    const history: RawMaEvent[] = [
      { id: "scan", type: "tool_call", tool: "crawl", source: "reddit" },
      { id: "thinking", type: "synthesis_chunk", note: "Working" },
    ];
    const live: RawMaEvent[] = [
      history[1],
      { id: "ignored", type: "unmapped", name: "span.model_request_start" },
      { id: "image", type: "seedream_image", url: "https://tos/image.png" },
    ];
    const baseline = await new Response(
      createSseStream({
        runId: "run-sse-monitoring",
        history,
        live: finiteEvents(live),
      }),
    ).text();
    const metricSink = new InMemoryMetricSink();

    const observed = await new Response(
      createSseStream({
        runId: "run-sse-monitoring",
        history,
        live: finiteEvents(live),
        metricSink,
      }),
    ).text();

    expect(observed).toBe(baseline);
    expect(observed.match(/id: thinking\n/g)).toHaveLength(1);
    expect(metricSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_sse_event_total",
          labels: { eventType: "scanning", disposition: "emitted" },
          value: 1,
        },
        {
          name: "ptv_sse_event_total",
          labels: { eventType: "synthesizing", disposition: "emitted" },
          value: 1,
        },
        {
          name: "ptv_sse_event_total",
          labels: { eventType: "synthesizing", disposition: "deduplicated" },
          value: 1,
        },
        {
          name: "ptv_sse_event_total",
          labels: { eventType: "unmapped", disposition: "ignored_unmapped" },
          value: 1,
        },
        {
          name: "ptv_sse_event_total",
          labels: { eventType: "done", disposition: "emitted" },
          value: 1,
        },
        {
          name: "ptv_sse_stream_total",
          labels: { outcome: "done" },
          value: 1,
        },
      ]),
    );
  });

  it("records fatal and cancelled stream outcomes", async () => {
    const fatalSink = new InMemoryMetricSink();
    const fatalText = await new Response(
      createSseStream({
        runId: "fatal-monitoring",
        history: [],
        live: finiteEvents([
          {
            id: "fatal",
            type: "error",
            recoverable: false,
            message: "MA terminated",
          },
        ]),
        metricSink: fatalSink,
      }),
    ).text();
    expect(fatalText).not.toContain("event: done");
    expect(fatalSink.snapshot().counters).toContainEqual({
      name: "ptv_sse_stream_total",
      labels: { outcome: "fatal_error" },
      value: 1,
    });

    const cancelSink = new InMemoryMetricSink();
    const live = new ControllableAsyncEvents<RawMaEvent>();
    const onCancel = vi.fn();
    const reader = createSseStream({
      runId: "cancel-monitoring",
      history: [],
      live,
      onCancel,
      metricSink: cancelSink,
    }).getReader();
    live.push({ id: "progress", type: "synthesis_chunk" });
    await readOneFrame(reader);
    await reader.cancel("client left");
    expect(cancelSink.snapshot().counters).toContainEqual({
      name: "ptv_sse_stream_total",
      labels: { outcome: "cancelled" },
      value: 1,
    });
  });

  it("preserves successful SSE completion when every metric record throws", async () => {
    const throwingSink: MetricSink = {
      record() {
        throw new Error("monitoring unavailable");
      },
    };

    const text = await new Response(
      createSseStream({
        runId: "sse-g5",
        history: [],
        live: finiteEvents([{ id: "progress", type: "synthesis_chunk" }]),
        metricSink: throwingSink,
      }),
    ).text();

    expect(text).toContain("id: progress\nevent: synthesizing\n");
    expect(text).toContain("id: sse-g5:done\nevent: done\n");
  });
});
