import type { UiEvent } from "../../../packages/contracts";
import type { UiEventSource } from "./event-source";

export function createRecordingUiEventSource({
  source,
  onEvent,
}: {
  source: UiEventSource;
  onEvent: (event: UiEvent) => void;
}): UiEventSource {
  return {
    async *events(): AsyncIterable<UiEvent> {
      for await (const event of source.events()) {
        onEvent(event);
        yield event;
      }
    },
  };
}
