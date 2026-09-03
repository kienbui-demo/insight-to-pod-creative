import { describe, expect, it, vi } from "vitest";

import type { RunSessionRepository } from "../../../packages/contracts";
import { translateRawMaEvents } from "../../bff/sse-translator";
import type { RawMaEvent } from "../../bff/types";
import { mapManagedAgentEvents } from "../ma-event-mapper";
import {
  decodeModelArkManagedAgentEvent,
  ModelArkManagedAgentClient,
} from "../modelark-managed-agent-client";
import type { ManagedAgentEvent } from "../ports";

const REAL_MANAGED_AGENT_EVENTS = [
  {
    processed_at: "2026-09-03T01:00:00.000Z",
    type: "session.status_running",
    id: "real-status-running",
  },
  {
    session_thread_id: "thread-real-1",
    id: "real-thread-running",
    type: "session.thread_status_running",
    processed_at: "2026-09-03T01:00:01.000Z",
    agent_name: "design-agent",
  },
  {
    session_thread_id: "thread-real-1",
    id: "real-thread-idle",
    processed_at: "2026-09-03T01:00:02.000Z",
    type: "session.thread_status_idle",
    stop_reason: { type: "end_turn", event_ids: ["real-agent-message"] },
    agent_name: "design-agent",
  },
  {
    processed_at: "2026-09-03T01:00:03.000Z",
    id: "real-user-message",
    type: "user.message",
    content: [{ type: "text", text: "Create the design" }],
  },
  {
    processed_at: "2026-09-03T01:00:04.000Z",
    type: "span.model_request_start",
    session_thread_id: "thread-real-1",
    id: "real-model-start",
  },
  {
    type: "span.model_request_end",
    model_usage: {
      input_tokens: 31,
      output_tokens: 17,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 0,
    },
    session_thread_id: "thread-real-1",
    model_request_start_id: "real-model-start",
    processed_at: "2026-09-03T01:00:05.000Z",
    is_error: false,
    id: "real-model-end",
  },
  {
    content: [
      { text: "Inspecting ", type: "text" },
      { text: "references.", type: "text" },
    ],
    id: "real-thinking",
    session_thread_id: "thread-real-1",
    type: "agent.thinking",
    processed_at: "2026-09-03T01:00:06.000Z",
  },
  {
    input: { prompt: "A hand-drawn botanical fox", size: "2048x2048" },
    type: "agent.custom_tool_use",
    session_thread_id: "thread-real-1",
    id: "real-image-tool-use",
    processed_at: "2026-09-03T01:00:07.000Z",
    name: "generate_design_image",
  },
  {
    stop_reason: {
      type: "requires_action",
      event_ids: ["real-image-tool-use"],
    },
    type: "session.status_idle",
    processed_at: "2026-09-03T01:00:08.000Z",
    id: "real-status-idle",
  },
  {
    id: "real-tool-result-echo",
    content: [{ type: "text", text: "Image result accepted" }],
    is_error: false,
    type: "user.custom_tool_result",
    processed_at: "2026-09-03T01:00:09.000Z",
    custom_tool_use_id: "real-image-tool-use",
  },
  {
    evaluated_permission: { allowed: true },
    input: { sources: ["knowledge-base"] },
    type: "agent.tool_use",
    name: "search",
    id: "real-built-in-tool-use",
    processed_at: "2026-09-03T01:00:10.000Z",
    session_thread_id: "thread-real-1",
  },
  {
    type: "agent.tool_result",
    content: [{ text: "No conflicting references", type: "text" }],
    is_error: false,
    session_thread_id: "thread-real-1",
    processed_at: "2026-09-03T01:00:11.000Z",
    id: "real-built-in-tool-result",
    tool_use_id: "real-built-in-tool-use",
  },
  {
    content: [
      { type: "text", text: "Your design " },
      { type: "text", text: "is ready." },
    ],
    session_thread_id: "thread-real-1",
    processed_at: "2026-09-03T01:00:12.000Z",
    id: "real-agent-message",
    type: "agent.message",
  },
] as const;

const SKIPPED_REAL_EVENT_IDS = [
  "real-status-running",
  "real-thread-running",
  "real-thread-idle",
  "real-user-message",
  "real-model-start",
  "real-model-end",
  "real-tool-result-echo",
  "real-built-in-tool-use",
  "real-built-in-tool-result",
] as const;

const END_TURN_IDLE_EVENT = {
  id: "real-status-idle-end-turn",
  type: "session.status_idle",
  processed_at: "2026-09-03T01:00:13.000Z",
  stop_reason: { type: "end_turn" },
} as const;

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe("G4 real ModelArk Managed Agent SSE decoding", () => {
  it("decodes actionable frames and returns null for real control and echo frames", () => {
    for (const event of REAL_MANAGED_AGENT_EVENTS) {
      expect(() => decodeModelArkManagedAgentEvent(event)).not.toThrow();
    }

    for (const id of SKIPPED_REAL_EVENT_IDS) {
      const event = REAL_MANAGED_AGENT_EVENTS.find((item) => item.id === id);
      expect(event).toBeDefined();
      expect(decodeModelArkManagedAgentEvent(event)).toBeNull();
    }

    expect(decodeModelArkManagedAgentEvent(REAL_MANAGED_AGENT_EVENTS[6])).toEqual(
      REAL_MANAGED_AGENT_EVENTS[6],
    );
    expect(decodeModelArkManagedAgentEvent(REAL_MANAGED_AGENT_EVENTS[7])).toEqual(
      REAL_MANAGED_AGENT_EVENTS[7],
    );
    expect(decodeModelArkManagedAgentEvent(REAL_MANAGED_AGENT_EVENTS[8])).toEqual(
      REAL_MANAGED_AGENT_EVENTS[8],
    );
    const agentMessage = decodeModelArkManagedAgentEvent(
      REAL_MANAGED_AGENT_EVENTS[12],
    );
    expect(agentMessage).toEqual(REAL_MANAGED_AGENT_EVENTS[12]);
    expect(
      agentMessage.type === "agent.message"
        ? agentMessage.content.map((item) => item.text).join("")
        : undefined,
    ).toBe("Your design is ready.");
    expect(decodeModelArkManagedAgentEvent(END_TURN_IDLE_EVENT)).toEqual(
      END_TURN_IDLE_EVENT,
    );
  });

  it("reads every real SSE frame without throwing and omits skipped frames", async () => {
    const body = `${REAL_MANAGED_AGENT_EVENTS.map(
      (event) => `data: ${JSON.stringify(event)}`,
    ).join("\n\n")}\n\n`;
    const fetchPort = vi.fn(() =>
      Promise.resolve(
        new Response(body, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    const runSessions: RunSessionRepository = {
      findByRunId: () =>
        Promise.resolve({
          runId: "run-real-sse",
          maSessionId: "session-real-sse",
          createdAt: "2026-09-03T00:00:00.000Z",
          updatedAt: "2026-09-03T00:00:00.000Z",
        }),
      saveIfAbsent: () => {
        throw new Error("existing run mapping should be reused");
      },
    };
    const client = new ModelArkManagedAgentClient({
      baseUrl: "https://modelark.example",
      apiKey: "test-key",
      agentId: "agent-real-sse",
      agentVersion: 1,
      environmentId: "environment-real-sse",
      runSessions,
      fetch: fetchPort,
    });
    const session = await client.attachOrCreate("run-real-sse");

    const decoded = await collect(session.openEvents());

    expect(decoded.map((event) => event.id)).toEqual([
      "real-thinking",
      "real-image-tool-use",
      "real-status-idle",
      "real-agent-message",
    ]);
    expect(decoded.some((event) =>
      SKIPPED_REAL_EVENT_IDS.includes(
        event.id as (typeof SKIPPED_REAL_EVENT_IDS)[number],
      ),
    )).toBe(false);
    expect(fetchPort).toHaveBeenCalledTimes(1);
  });

  it("joins real thinking content and leaves control and agent messages unmapped", () => {
    const decoded = REAL_MANAGED_AGENT_EVENTS.map((event) =>
      decodeModelArkManagedAgentEvent(event),
    ).filter((event): event is ManagedAgentEvent => event !== null);

    const mapped = mapManagedAgentEvents(decoded);

    expect(mapped).toEqual([
      {
        id: "real-thinking",
        type: "synthesis_chunk",
        note: "Inspecting references.",
      } satisfies RawMaEvent,
      {
        id: "real-image-tool-use",
        type: "unmapped",
        name: "agent.custom_tool_use",
      } satisfies RawMaEvent,
      {
        id: "real-status-idle",
        type: "unmapped",
        name: "session.status_idle",
      } satisfies RawMaEvent,
      {
        id: "real-agent-message",
        type: "unmapped",
        name: "agent.message",
      } satisfies RawMaEvent,
    ]);
    expect(translateRawMaEvents(mapped)).toEqual([
      {
        id: "real-thinking",
        type: "synthesizing",
        note: "Inspecting references.",
      },
    ]);
  });
});
