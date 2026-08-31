import { describe, expect, it } from "vitest";

import type {
  CreateRunSessionMapping,
  MetricSink,
  RunSessionMapping,
  RunSessionRepository,
} from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import { sourceFailureTurn } from "../__fixtures__/managed-agent-events";
import { trendCardMissing } from "../__fixtures__/trend-card";
import { createModelArkLiveSessionPort } from "../modelark-live-session";
import { ModelArkManagedAgentClient } from "../modelark-managed-agent-client";
import type { ManagedAgentEvent } from "../ports";
import { FakeManagedAgentClient } from "./support/fake-managed-agent-client";
import { FakeSeedreamImagePort } from "./support/fake-seedream-image-port";
import { collectAsync } from "./support/manual-async-stream";

const REQUEST = {
  kind: "trend-card" as const,
  crawl: {
    source: "tiktok" as const,
    market: "US",
    seed: "retro halloween cats",
    mode: "live" as const,
  },
};

class InMemoryRunSessions implements RunSessionRepository {
  private mapping: RunSessionMapping | null = null;

  async findByRunId(): Promise<RunSessionMapping | null> {
    return this.mapping;
  }

  async saveIfAbsent(input: CreateRunSessionMapping): Promise<RunSessionMapping> {
    this.mapping ??= {
      ...input,
      createdAt: "2026-08-28T10:00:00.000Z",
      updatedAt: "2026-08-28T10:00:00.000Z",
    };
    return this.mapping;
  }
}

describe("agent C8 monitoring", () => {
  it("records live crawl failure/contribution while preserving the exact C4 input stream", async () => {
    const metricSink = new InMemoryMetricSink();
    const client = new FakeManagedAgentClient();
    const sessions = createModelArkLiveSessionPort({
      client,
      seedream: new FakeSeedreamImagePort(),
      maxImagesPerAction: 1,
      metricSink,
    });
    const run = await sessions.create("run-agent-monitoring");
    const collected = collectAsync(run.openEvents());
    await run.send(REQUEST);
    const managedEvents = sourceFailureTurn("tiktok", trendCardMissing("tiktok"));
    for (const event of managedEvents) client.session.events.push(event);

    const events = await collected;

    expect(events).toEqual([
      {
        id: "ma-tiktok-error",
        type: "error",
        recoverable: true,
        message: "tiktok unavailable; continuing with remaining sources",
      },
      {
        id: "ma-tiktok-card",
        type: "final_card",
        card: trendCardMissing("tiktok"),
      },
    ]);
    expect(metricSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "tiktok",
            mode: "live",
            outcome: "failure",
            stage: "final_card",
          },
          value: 1,
        },
        {
          name: "ptv_crawl_source_run_total",
          labels: {
            source: "google_trends",
            mode: "live",
            outcome: "success",
            stage: "final_card",
          },
          value: 1,
        },
        {
          name: "ptv_trend_card_build_total",
          labels: { mode: "live", outcome: "degraded" },
          value: 1,
        },
      ]),
    );
  });

  it("records counters and durations for existing ModelArk client operations", async () => {
    const metricSink = new InMemoryMetricSink();
    const fetchCalls: Array<{ url: string; method: string }> = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      fetchCalls.push({ url, method });
      if (url.endsWith("/api/v3/sessions")) {
        return Response.json({ id: "ma-session-monitoring" });
      }
      if (url.endsWith("/events/stream")) {
        return new Response(
          'data: {"id":"idle","type":"session.status_idle","stop_reason":{"type":"end_turn"}}\n\n',
        );
      }
      if (method === "GET") return Response.json({ events: [] });
      return new Response(null, { status: 200 });
    };
    const client = new ModelArkManagedAgentClient({
      baseUrl: "https://modelark.example",
      apiKey: "test-key",
      agentId: "agent-id",
      agentVersion: 1,
      environmentId: "environment-id",
      runSessions: new InMemoryRunSessions(),
      fetch,
      metricSink,
    });

    const session = await client.attachOrCreate("run-client-monitoring");
    await session.history();
    for await (const event of session.openEvents()) {
      expect(event.type).toBe("session.status_idle");
    }
    await session.send(REQUEST);
    await session.interrupt();
    await session.submitCustomToolResult({
      id: "tool-result-monitoring",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    } satisfies ManagedAgentEvent);

    expect(fetchCalls).toHaveLength(6);
    for (const operation of [
      "session_attach_or_create",
      "history_read",
      "event_stream",
      "send",
      "interrupt",
      "submit_tool_result",
    ] as const) {
      expect(metricSink.snapshot().counters).toContainEqual({
        name: "ptv_infra_operation_total",
        labels: { component: "modelark", operation, outcome: "success" },
        value: 1,
      });
      expect(metricSink.snapshot().distributions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "ptv_infra_operation_duration_ms",
            labels: { component: "modelark", operation, outcome: "success" },
          }),
        ]),
      );
    }
  });

  it("keeps recoverable live degradation intact when monitoring always throws", async () => {
    const throwingSink: MetricSink = {
      record() {
        throw new Error("monitoring unavailable");
      },
    };
    const client = new FakeManagedAgentClient();
    const sessions = createModelArkLiveSessionPort({
      client,
      seedream: new FakeSeedreamImagePort(),
      maxImagesPerAction: 1,
      metricSink: throwingSink,
    });
    const run = await sessions.create("run-agent-g5");
    const collected = collectAsync(run.openEvents());
    await run.send(REQUEST);
    for (const event of sourceFailureTurn("tiktok", trendCardMissing("tiktok"))) {
      client.session.events.push(event);
    }

    await expect(collected).resolves.toEqual([
      expect.objectContaining({ type: "error", recoverable: true }),
      expect.objectContaining({ type: "final_card" }),
    ]);
  });
});
