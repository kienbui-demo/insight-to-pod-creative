import type { UiEvent } from "../../packages/contracts";

const encoder = new TextEncoder();

export function encodeSseEvent(event: UiEvent): Uint8Array {
  return encoder.encode(
    `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}
