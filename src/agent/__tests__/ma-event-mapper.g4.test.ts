import { describe, expect, it } from "vitest";

import type { RawMaEvent } from "../../bff/types";
import {
  EXPECTED_RAW_MA_EVENTS,
  RECORDED_MANAGED_AGENT_EVENTS,
} from "../__fixtures__/managed-agent-events";
import { mapManagedAgentEvents } from "../ma-event-mapper";
import type { ManagedAgentEvent } from "../ports";

describe("G4 MA event mapper contract", () => {
  it("maps the recorded MA stream to the exact ordered RawMaEvent sequence", () => {
    const mapped = mapManagedAgentEvents(RECORDED_MANAGED_AGENT_EVENTS);

    expect(mapped).toEqual(EXPECTED_RAW_MA_EVENTS);
    expect(mapped).toEqual([
      {
        id: "ma-001",
        type: "tool_call",
        tool: "crawl",
        source: "reddit",
      } satisfies RawMaEvent,
      {
        id: "ma-002",
        type: "error",
        recoverable: true,
        message: "TikTok timed out; continuing with remaining sources",
      } satisfies RawMaEvent,
      {
        id: "ma-003",
        type: "synthesis_chunk",
        note: "Comparing demand with active-ad competition.",
      } satisfies RawMaEvent,
      {
        id: "ma-004",
        type: "seedream_image",
        url: "https://tos.example/generated/retro-halloween-cat.png",
      } satisfies RawMaEvent,
      {
        id: "ma-005",
        type: "final_card",
        card: EXPECTED_RAW_MA_EVENTS[4].card,
      } satisfies RawMaEvent,
      {
        id: "ma-006",
        type: "unmapped",
        name: "span.model_request_start",
      } satisfies RawMaEvent,
    ]);
  });

  it("preserves stable provider ids across repeated mapping", () => {
    const first = mapManagedAgentEvents(RECORDED_MANAGED_AGENT_EVENTS);
    const second = mapManagedAgentEvents(RECORDED_MANAGED_AGENT_EVENTS);

    expect(first.map((event) => event.id)).toEqual(
      RECORDED_MANAGED_AGENT_EVENTS.map((event) => event.id),
    );
    expect(second).toEqual(first);
  });

  it("maps an unknown MA event to unmapped without exposing its payload", () => {
    const unknown = RECORDED_MANAGED_AGENT_EVENTS.at(-1);

    expect(unknown).toBeDefined();
    expect(mapManagedAgentEvents([unknown!])).toEqual([
      {
        id: "ma-006",
        type: "unmapped",
        name: "span.model_request_start",
      } satisfies RawMaEvent,
    ]);
  });

  it("maps both supported custom-tool names to the available RawMaEvent shapes", () => {
    const events = [
      {
        id: "ma-crawl-tool-call",
        type: "agent.custom_tool_use",
        name: "crawl",
        input: { source: "reddit" },
      },
      {
        id: "ma-design-tool-call",
        type: "agent.custom_tool_use",
        name: "generate_design_image",
        input: {
          prompt: "Blend two botanical references",
          size: "2048x2048",
          referenceImages: [
            { base64: "aW1hZ2UtMQ==", mimeType: "image/png" },
            { base64: "aW1hZ2UtMg==", mimeType: "image/jpeg" },
          ],
        },
      },
    ] as const satisfies readonly ManagedAgentEvent[];

    expect(mapManagedAgentEvents(events)).toEqual([
      {
        id: "ma-crawl-tool-call",
        type: "tool_call",
        tool: "crawl",
        source: "reddit",
      } satisfies RawMaEvent,
      {
        id: "ma-design-tool-call",
        type: "unmapped",
        name: "agent.custom_tool_use",
      } satisfies RawMaEvent,
    ]);
  });
});
