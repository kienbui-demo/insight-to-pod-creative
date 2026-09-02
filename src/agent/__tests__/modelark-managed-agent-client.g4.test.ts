import { describe, expect, it } from "vitest";

import { createSseStream } from "../../bff/sse-stream";
import type { RawMaEvent } from "../../bff/types";
import { createSseUiEventSource } from "../../ui/live-theater/sse-ui-event-source";
import type { UiEvent } from "../../../packages/contracts";
import {
  EXPECTED_C1_UI_EVENTS,
  PROVISIONAL_MODELARK_RECORDING,
} from "../__fixtures__/modelark-managed-agent-events.c1.provisional";
import { mapManagedAgentEvents } from "../ma-event-mapper";
import { decodeModelArkManagedAgentEvent } from "../modelark-managed-agent-client";
import { RouteDispatchFetch } from "../../integration/__tests__/support/route-dispatch-fetch";

function finiteEvents(events: readonly RawMaEvent[]): AsyncIterable<RawMaEvent> {
  return (async function* () {
    yield* events;
  })();
}

async function collect(source: {
  events(): AsyncIterable<UiEvent>;
}): Promise<UiEvent[]> {
  const events: UiEvent[] = [];
  for await (const event of source.events()) {
    events.push(event);
  }
  return events;
}

describe("C1 G4 provisional ModelArk event integration", () => {
  it("decodes MA events and preserves exact semantics through RawMaEvent, SSE, and the UI parser", async () => {
    expect(PROVISIONAL_MODELARK_RECORDING.fixtureStatus).toBe("provisional");

    const decoded = PROVISIONAL_MODELARK_RECORDING.events.map((event) =>
      decodeModelArkManagedAgentEvent(structuredClone(event)),
    );
    const rawEvents = mapManagedAgentEvents(decoded);
    const routeFetch = new RouteDispatchFetch(() =>
      Promise.resolve(
        new Response(
          createSseStream({
            runId: "run-c1-g4",
            history: [],
            live: finiteEvents(rawEvents),
          }),
          { headers: { "content-type": "text/event-stream; charset=utf-8" } },
        ),
      ),
    );
    const source = createSseUiEventSource({
      url: "http://in-memory.test/api/live",
      runId: "run-c1-g4",
      request: {
        kind: "trend-card",
        crawl: {
          source: "google_trends",
          market: "US",
          seed: "retro halloween cats",
          productType: "t-shirt",
          mode: "live",
        },
      },
      fetch: routeFetch.fetch,
    });

    await expect(collect(source)).resolves.toEqual(EXPECTED_C1_UI_EVENTS);
    expect(rawEvents.map((event) => event.id)).toEqual([
      "ma-c1-001",
      "ma-c1-002",
      "ma-c1-003",
      "ma-c1-004",
      "ma-c1-005",
      "ma-c1-006",
    ]);
    expect(routeFetch.requests).toHaveLength(1);
  });
});

describe("provisional ModelArk custom-tool decoder", () => {
  it("accepts generate_design_image with mixed reference_image_sources", () => {
    const event = {
      id: "ma-design-with-references",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input: {
        prompt: "Blend these references into a vintage botanical print",
        size: "2048x2048",
        seed: 7319,
        reference_image_sources: [
          { type: "url", url: "https://assets.example/botanical.png" },
          { type: "file", file_id: "file-botanical-001" },
        ],
      },
    } as const;

    expect(decodeModelArkManagedAgentEvent(event)).toEqual(event);
  });

  it("accepts generate_design_image with an empty reference_image_sources array", () => {
    const event = {
      id: "ma-design-empty-references",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input: {
        prompt: "Create a vintage botanical print",
        size: "2048x2048",
        reference_image_sources: [],
      },
    } as const;

    expect(decodeModelArkManagedAgentEvent(event)).toEqual(event);
  });

  it("accepts generate_design_image without reference_image_sources", () => {
    const event = {
      id: "ma-design-without-references",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input: {
        prompt: "Create a vintage botanical print",
        size: "2048x2048",
      },
    } as const;

    expect(decodeModelArkManagedAgentEvent(event)).toEqual(event);
  });

  it("still accepts the crawl custom-tool variant", () => {
    const event = {
      id: "ma-crawl",
      type: "agent.custom_tool_use",
      name: "crawl",
      input: { source: "reddit" },
    } as const;

    expect(decodeModelArkManagedAgentEvent(event)).toEqual(event);
  });

  it("rejects generate_design_image when a reference source type is invalid", () => {
    const event = {
      id: "ma-design-invalid-reference-type",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input: {
        prompt: "Create a vintage botanical print",
        size: "2048x2048",
        reference_image_sources: [{ type: "base64" }],
      },
    };

    expect(() => decodeModelArkManagedAgentEvent(event)).toThrow(
      "Invalid provisional ModelArk event",
    );
  });

  it("rejects generate_design_image when a present url is not a string", () => {
    const event = {
      id: "ma-design-invalid-reference-url",
      type: "agent.custom_tool_use",
      name: "generate_design_image",
      input: {
        prompt: "Create a vintage botanical print",
        size: "2048x2048",
        reference_image_sources: [{ type: "url", url: 42 }],
      },
    };

    expect(() => decodeModelArkManagedAgentEvent(event)).toThrow(
      "Invalid provisional ModelArk event",
    );
  });
});

describe("provisional ModelArk idle-status decoder", () => {
  it("accepts the existing end_turn stop reason", () => {
    const event = {
      id: "ma-idle-end-turn",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    } as const;

    expect(decodeModelArkManagedAgentEvent(event)).toEqual(event);
  });

  it("accepts requires_action with event ids", () => {
    const event = {
      id: "ma-idle-requires-action",
      type: "session.status_idle",
      stop_reason: {
        type: "requires_action",
        event_ids: ["ev-1", "ev-2"],
      },
    } as const;

    expect(decodeModelArkManagedAgentEvent(event)).toEqual(event);
  });

  it("accepts requires_action with an empty event_ids array", () => {
    const event = {
      id: "ma-idle-requires-action-empty",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: [] },
    } as const;

    expect(decodeModelArkManagedAgentEvent(event)).toEqual(event);
  });

  it("rejects requires_action when event_ids is missing", () => {
    const event = {
      id: "ma-idle-requires-action-missing-event-ids",
      type: "session.status_idle",
      stop_reason: { type: "requires_action" },
    };

    expect(() => decodeModelArkManagedAgentEvent(event)).toThrow(
      "Invalid provisional ModelArk event",
    );
  });

  it("rejects requires_action when an event_ids item is not a string", () => {
    const event = {
      id: "ma-idle-requires-action-invalid-event-id",
      type: "session.status_idle",
      stop_reason: { type: "requires_action", event_ids: ["ev-1", 2] },
    };

    expect(() => decodeModelArkManagedAgentEvent(event)).toThrow(
      "Invalid provisional ModelArk event",
    );
  });
});
