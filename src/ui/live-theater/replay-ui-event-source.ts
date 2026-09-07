import type { UiEvent } from "../../../packages/contracts";
import type { UiEventSource } from "./event-source";

export function createReplayUiEventSource(events: UiEvent[]): UiEventSource {
  return {
    async *events(): AsyncIterable<UiEvent> {
      yield* events;
    },
  };
}
