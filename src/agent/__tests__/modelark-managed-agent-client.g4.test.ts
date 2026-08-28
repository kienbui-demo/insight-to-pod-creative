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
