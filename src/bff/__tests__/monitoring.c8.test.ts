import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricSink } from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import { RECORDED_TREND_CARD } from "../__fixtures__/raw-ma-events";
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

function structuredLines(consoleLog: ReturnType<typeof vi.spyOn>) {
  return consoleLog.mock.calls.map(([line]) => JSON.parse(String(line)) as {
    ts?: string;
    step?: string;
    runId?: string;
    eventType?: string;
    source?: string;
    outcome?: string;
    durationMs?: number;
    reason?: string;
    message?: string;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("logs every translated disposition with run context and redacts event payloads", async () => {
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const imageUrl =
      "https://images.example/private.png?authorization=Bearer-image-secret";
    const answerText = "private answer text that must never be logged";
    const cardSecret = "serialized card content must never be logged";
    const card = {
      ...RECORDED_TREND_CARD,
      recommendation: {
        ...RECORDED_TREND_CARD.recommendation,
        reasoning: cardSecret,
      },
    };
    const duplicate = {
      id: "scan",
      type: "tool_call",
      tool: "crawl",
      source: "reddit",
    } satisfies RawMaEvent;

    await new Response(
      createSseStream({
        runId: "run-structured-sse",
        history: [duplicate],
        live: finiteEvents([
          duplicate,
          { id: "think", type: "synthesis_chunk", note: "working" },
          { id: "image", type: "seedream_image", url: imageUrl },
          { id: "answer", type: "agent_message", text: answerText },
          { id: "card", type: "final_card", card },
          {
            id: "ignored",
            type: "unmapped",
            name: "authorization: Bearer raw-event-secret",
          },
        ]),
        metricSink: new InMemoryMetricSink(),
      }),
    ).text();

    const eventLines = structuredLines(consoleLog).filter(
      (line) => line.step === "sse_event",
    );
    expect(eventLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: "run-structured-sse",
          eventType: "scanning",
          source: "reddit",
          outcome: "emitted",
        }),
        expect.objectContaining({
          runId: "run-structured-sse",
          eventType: "scanning",
          source: "reddit",
          outcome: "deduplicated",
        }),
        expect.objectContaining({
          eventType: "synthesizing",
          outcome: "emitted",
        }),
        expect.objectContaining({
          eventType: "image:ready",
          outcome: "emitted",
        }),
        expect.objectContaining({
          eventType: "answer",
          outcome: "emitted",
        }),
        expect.objectContaining({
          eventType: "card:ready",
          outcome: "emitted",
        }),
        expect.objectContaining({
          eventType: "unmapped",
          outcome: "ignored_unmapped",
        }),
        expect.objectContaining({ eventType: "done", outcome: "emitted" }),
      ]),
    );
    for (const line of eventLines) {
      expect(line.runId).toBe("run-structured-sse");
      expect(new Date(line.ts ?? "invalid").toISOString()).toBe(line.ts);
    }

    const serializedLogs = consoleLog.mock.calls.flat().join("\n");
    expect(serializedLogs).not.toContain(imageUrl);
    expect(serializedLogs).not.toContain(answerText);
    expect(serializedLogs).not.toContain(cardSecret);
    expect(serializedLogs).not.toContain("authorization");
    expect(serializedLogs).not.toContain("raw-event-secret");
  });

  it("logs fatal and cancelled terminal outcomes with duration and reason", async () => {
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    await new Response(
      createSseStream({
        runId: "run-fatal-sse",
        history: [],
        live: finiteEvents([
          {
            id: "fatal",
            type: "error",
            recoverable: false,
            message: "MA stream failed with status 503",
          },
        ]),
      }),
    ).text();

    const live = new ControllableAsyncEvents<RawMaEvent>();
    const reader = createSseStream({
      runId: "run-cancelled-sse",
      history: [],
      live,
    }).getReader();
    live.push({ id: "progress", type: "synthesis_chunk" });
    await readOneFrame(reader);
    await reader.cancel("seller navigated away");

    const streamLines = structuredLines(consoleLog).filter(
      (line) => line.step === "sse_stream",
    );
    expect(streamLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: "run-fatal-sse",
          outcome: "fatal_error",
          durationMs: expect.any(Number),
          reason: "MA stream failed with status 503",
        }),
        expect.objectContaining({
          runId: "run-cancelled-sse",
          outcome: "cancelled",
          durationMs: expect.any(Number),
          reason: "seller navigated away",
        }),
      ]),
    );
  });
});
