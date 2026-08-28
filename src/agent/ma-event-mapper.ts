import type { RawMaEvent } from "../bff/types";
import type { ManagedAgentEvent } from "./ports";

function mapManagedAgentEvent(event: ManagedAgentEvent): RawMaEvent {
  switch (event.type) {
    case "agent.custom_tool_use":
      return {
        id: event.id,
        type: "tool_call",
        tool: "crawl",
        source: event.input.source,
      };
    case "session.error":
      return {
        id: event.id,
        type: "error",
        recoverable: event.error.recoverable,
        message: event.error.message,
      };
    case "agent.thinking":
      return event.note === undefined
        ? { id: event.id, type: "synthesis_chunk" }
        : { id: event.id, type: "synthesis_chunk", note: event.note };
    case "user.custom_tool_result":
      return event.result.ok
        ? { id: event.id, type: "seedream_image", url: event.result.url }
        : { id: event.id, type: "unmapped", name: event.type };
    case "agent.output":
      return {
        id: event.id,
        type: "final_card",
        card: event.output.card,
      };
    default:
      return { id: event.id, type: "unmapped", name: event.type };
  }
}

export function mapManagedAgentEvents(
  events: Iterable<ManagedAgentEvent>,
): RawMaEvent[] {
  return Array.from(events, mapManagedAgentEvent);
}
