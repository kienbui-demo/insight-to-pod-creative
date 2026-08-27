import type { UiEvent } from "../../packages/contracts";
import type { RawMaEvent } from "./types";

export function translateRawMaEvent(raw: RawMaEvent): UiEvent | undefined {
  switch (raw.type) {
    case "tool_call":
      return { id: raw.id, type: "scanning", source: raw.source };
    case "synthesis_chunk":
      return raw.note === undefined
        ? { id: raw.id, type: "synthesizing" }
        : { id: raw.id, type: "synthesizing", note: raw.note };
    case "seedream_image":
      return { id: raw.id, type: "image:ready", url: raw.url };
    case "final_card":
      return { id: raw.id, type: "card:ready", card: raw.card };
    case "error":
      return {
        id: raw.id,
        type: "error",
        recoverable: raw.recoverable,
        message: raw.message,
      };
    case "unmapped":
      return undefined;
  }
}

export function translateRawMaEvents(
  raws: Iterable<RawMaEvent>,
): UiEvent[] {
  const translated: UiEvent[] = [];
  const seen = new Set<string>();

  for (const raw of raws) {
    const event = translateRawMaEvent(raw);
    if (event === undefined || seen.has(event.id)) {
      continue;
    }

    seen.add(event.id);
    translated.push(event);
  }

  return translated;
}
