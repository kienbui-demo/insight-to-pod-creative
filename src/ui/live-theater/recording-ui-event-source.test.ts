import { describe, expect, it, vi } from "vitest";

import type { UiEvent } from "../../../packages/contracts";
import type { UiEventSource } from "./event-source";
import { createRecordingUiEventSource } from "./recording-ui-event-source";

describe("createRecordingUiEventSource", () => {
  it("records every source event before yielding it downstream", async () => {
    const events = [
      { id: "answer-1", type: "answer", text: "Live answer" },
      { id: "done-1", type: "done" },
    ] satisfies UiEvent[];
    const trace: string[] = [];
    const source: UiEventSource = {
      async *events() {
        yield* events;
      },
    };
    const onEvent = vi.fn((event: UiEvent) => {
      trace.push(`record:${event.id}`);
    });
    const recorded = createRecordingUiEventSource({ source, onEvent });
    const received: UiEvent[] = [];

    for await (const event of recorded.events()) {
      trace.push(`yield:${event.id}`);
      received.push(event);
    }

    expect(received).toEqual(events);
    expect(onEvent.mock.calls.map(([event]) => event)).toEqual(events);
    expect(trace).toEqual([
      "record:answer-1",
      "yield:answer-1",
      "record:done-1",
      "yield:done-1",
    ]);
  });
});
