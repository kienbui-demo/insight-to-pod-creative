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
          reference_image_sources: [
            { type: "url", url: "https://assets.example/botanical.png" },
            { type: "file", file_id: "file-botanical-001" },
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

  it("keeps crawl tool results internal and preserves Seedream success mapping", () => {
    const events = [
      {
        id: "ma-crawl-result-success",
        type: "user.custom_tool_result",
        custom_tool_use_id: "ma-crawl-tool-success",
        name: "crawl",
        input: { source: "reddit" },
        result: { ok: true, records: [] },
      },
      {
        id: "ma-crawl-result-failure",
        type: "user.custom_tool_result",
        custom_tool_use_id: "ma-crawl-tool-failure",
        name: "crawl",
        input: { source: "meta_ads" },
        result: {
          ok: false,
          recoverable: true,
          message: "Meta Ads timed out",
        },
      },
      {
        id: "ma-seedream-result-success",
        type: "user.custom_tool_result",
        custom_tool_use_id: "ma-seedream-tool-success",
        name: "generate_design_image",
        input: { prompt: "Vintage botanical fox", size: "2K" },
        result: { ok: true, url: "https://tos.example/generated/fox.png" },
      },
    ] as const satisfies readonly ManagedAgentEvent[];

    expect(mapManagedAgentEvents(events)).toEqual([
      {
        id: "ma-crawl-result-success",
        type: "unmapped",
        name: "user.custom_tool_result",
      },
      {
        id: "ma-crawl-result-failure",
        type: "unmapped",
        name: "user.custom_tool_result",
      },
      {
        id: "ma-seedream-result-success",
        type: "seedream_image",
        url: "https://tos.example/generated/fox.png",
      },
    ] satisfies RawMaEvent[]);
  });

  it("joins agent message content into one semantic answer payload", () => {
    const event = {
      id: "ma-answer",
      type: "agent.message",
      content: [
        { type: "text", text: "Design **ready**. " },
        { type: "text", text: "[Open image](https://tos.example/design.png)" },
      ],
    } as const satisfies ManagedAgentEvent;

    expect(mapManagedAgentEvents([event])).toEqual([
      {
        id: "ma-answer",
        type: "agent_message",
        text: "Design **ready**. [Open image](https://tos.example/design.png)",
      } satisfies RawMaEvent,
    ]);
  });
});
