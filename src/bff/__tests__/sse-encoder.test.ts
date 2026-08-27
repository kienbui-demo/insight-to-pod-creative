import { describe, expect, it } from "vitest";

import type { UiEvent } from "../../../packages/contracts";
import { RECORDED_TREND_CARD } from "../__fixtures__/raw-ma-events";
import { encodeSseEvent } from "../sse-encoder";

const decoder = new TextDecoder();

function encode(event: UiEvent): string {
  return decoder.decode(encodeSseEvent(event));
}

describe("SSE encoder", () => {
  it.each<UiEvent>([
    { id: "1", type: "scanning", source: "reddit" },
    { id: "2", type: "synthesizing", note: "Comparing signals" },
    { id: "3", type: "image:ready", url: "https://tos/image.png" },
    { id: "4", type: "card:ready", card: RECORDED_TREND_CARD },
    { id: "5", type: "error", recoverable: true, message: "Retrying" },
    { id: "run-1:done", type: "done" },
  ])("encodes the full $type UiEvent as one exact SSE frame", (event) => {
    expect(encode(event)).toBe(
      `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  });

  it("preserves colon event names", () => {
    expect(
      encode({ id: "image", type: "image:ready", url: "https://tos/x" }),
    ).toContain("event: image:ready\n");
  });

  it("keeps quotes, newlines, and unicode inside valid single-line JSON data", () => {
    const event: UiEvent = {
      id: "unicode",
      type: "error",
      recoverable: true,
      message: "Try \"cats\"\nagain 🐈",
    };
    const frame = encode(event);
    const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));

    expect(dataLine).toBeDefined();
    expect(JSON.parse(dataLine!.slice("data: ".length))).toEqual(event);
    expect(frame.match(/\n\n$/)).not.toBeNull();
  });
});
