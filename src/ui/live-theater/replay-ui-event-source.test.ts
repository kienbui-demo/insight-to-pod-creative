import { describe, expect, it } from "vitest";

import type { UiEvent } from "../../../packages/contracts";
import type { UiEventSource } from "./event-source";
import { createReplayUiEventSource } from "./replay-ui-event-source";

async function collect(source: UiEventSource): Promise<UiEvent[]> {
  const events: UiEvent[] = [];
  for await (const event of source.events()) {
    events.push(event);
  }
  return events;
}

describe("createReplayUiEventSource", () => {
  it("replays exactly the stored events in order", async () => {
    const events = [
      { id: "scan-1", type: "scanning", source: "reddit" },
      { id: "answer-1", type: "answer", text: "Stored answer" },
      { id: "done-1", type: "done" },
    ] satisfies UiEvent[];

    await expect(collect(createReplayUiEventSource(events))).resolves.toEqual(
      events,
    );
  });
});
