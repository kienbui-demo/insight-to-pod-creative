import type { UiEvent } from "../../../packages/contracts";

export interface UiEventSource {
  events(): AsyncIterable<UiEvent>;
}
