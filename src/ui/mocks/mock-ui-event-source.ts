import type { TrendCard, UiEvent } from "../../../packages/contracts";
import type { UiEventSource } from "../live-theater/event-source";

export class MockUiEventSource implements UiEventSource {
  constructor(
    private readonly stream: readonly UiEvent[],
    private readonly delayMilliseconds = 250,
  ) {}

  async *events(): AsyncIterable<UiEvent> {
    for (const event of this.stream) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.delayMilliseconds),
      );
      yield event;
    }
  }
}

export function createMockUiEventSource(card: TrendCard): UiEventSource {
  const events = [
    { id: `${card.id}-1`, type: "scanning", source: "reddit" },
    { id: `${card.id}-2`, type: "scanning", source: "amazon" },
    {
      id: `${card.id}-3`,
      type: "synthesizing",
      note: "Comparing demand, culture, and active ads",
    },
    { id: `${card.id}-4`, type: "image:ready", url: card.referenceImages[0] },
    { id: `${card.id}-5`, type: "card:ready", card },
    ...(card.missingSources.length > 0
      ? [
          {
            id: `${card.id}-6`,
            type: "error" as const,
            recoverable: true,
            message: `Partial confidence: ${card.missingSources.length} source unavailable`,
          },
        ]
      : []),
    { id: `${card.id}-7`, type: "done" },
  ] satisfies UiEvent[];

  return new MockUiEventSource(events);
}
