import { describe, expect, it } from "vitest";

import { translateRawMaEvents } from "../../bff/sse-translator";
import {
  EXPECTED_F1_REAL_UI_EVENTS,
  F1_REAL_MODELARK_RECORDING,
} from "../__fixtures__/modelark-managed-agent-events.f1.real";
import { mapManagedAgentEvents } from "../ma-event-mapper";
import { decodeModelArkManagedAgentEvent } from "../modelark-managed-agent-client";
import type { ManagedAgentEvent } from "../ports";

describe("G4 F1 real ModelArk server-wire fixture", () => {
  it("records all 23 server events with stable redacted identities", () => {
    expect(F1_REAL_MODELARK_RECORDING.fixtureStatus).toBe("real");
    expect(F1_REAL_MODELARK_RECORDING.events).toHaveLength(23);
    expect(F1_REAL_MODELARK_RECORDING.events.map((event) => event.id)).toEqual(
      Array.from(
        { length: 23 },
        (_, index) => `f1-real-${String(index + 1).padStart(3, "0")}`,
      ),
    );

    const serialized = JSON.stringify(F1_REAL_MODELARK_RECORDING);
    expect(serialized).not.toMatch(/sevt-|sesn-|sthr-|lir-/);
    expect(serialized).not.toContain("call_");
  });

  it("decodes every server event without throwing and maps exact UI semantics", () => {
    for (const event of F1_REAL_MODELARK_RECORDING.events) {
      expect(() => decodeModelArkManagedAgentEvent(event)).not.toThrow();
    }

    const decoded = F1_REAL_MODELARK_RECORDING.events
      .map((event) => decodeModelArkManagedAgentEvent(event))
      .filter((event): event is ManagedAgentEvent => event !== null);

    expect(EXPECTED_F1_REAL_UI_EVENTS).toHaveLength(4);
    expect(translateRawMaEvents(mapManagedAgentEvents(decoded))).toEqual(
      EXPECTED_F1_REAL_UI_EVENTS,
    );
  });

  it("preserves tool-use and model-request references after redaction", () => {
    const events = F1_REAL_MODELARK_RECORDING.events;
    const customToolUse = events.find(
      (event) => event.type === "agent.custom_tool_use",
    );
    const customToolResult = events.find(
      (event) => event.type === "user.custom_tool_result",
    );
    const builtInToolUse = events.find(
      (event) => event.type === "agent.tool_use",
    );
    const builtInToolResult = events.find(
      (event) => event.type === "agent.tool_result",
    );

    expect(customToolUse).toBeDefined();
    expect(customToolResult).toBeDefined();
    expect(builtInToolUse).toBeDefined();
    expect(builtInToolResult).toBeDefined();
    if (
      customToolUse === undefined ||
      customToolResult === undefined ||
      builtInToolUse === undefined ||
      builtInToolResult === undefined
    ) {
      throw new Error("real fixture is missing a tool reference event");
    }

    const requiresActionEventIds: string[][] = [];
    const modelRequestStartIds: string[] = [];
    const modelRequestEndStartIds: string[] = [];
    for (const event of events) {
      if (
        (event.type === "session.thread_status_idle" ||
          event.type === "session.status_idle") &&
        event.stop_reason.type === "requires_action"
      ) {
        requiresActionEventIds.push([...event.stop_reason.event_ids]);
      }
      if (event.type === "span.model_request_start") {
        modelRequestStartIds.push(event.id);
      }
      if (event.type === "span.model_request_end") {
        modelRequestEndStartIds.push(event.model_request_start_id);
      }
    }

    expect(requiresActionEventIds).toEqual([
      [customToolUse.id],
      [customToolUse.id],
    ]);
    expect(customToolResult.custom_tool_use_id).toBe(customToolUse.id);
    expect(modelRequestEndStartIds).toEqual(modelRequestStartIds);
    expect(builtInToolResult.tool_use_id).toBe(builtInToolUse.id);
  });
});
