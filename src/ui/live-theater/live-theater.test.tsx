import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TrendCard, UiEvent } from "../../../packages/contracts";
import type { UiEventSource } from "./event-source";
import { LiveTheater } from "./live-theater";

const TREND_CARD = {
  id: "trend-retro-halloween-cats",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  opportunityScore: 84,
  confidence: 0.91,
  availableSources: ["reddit", "amazon", "meta_ads"],
  missingSources: ["tiktok"],
  trendSeries: [
    { t: "2026-08-13", v: 61 },
    { t: "2026-08-20", v: 72 },
    { t: "2026-08-27", v: 85 },
  ],
  referenceImages: ["https://tos.example/reference.png"],
  recommendation: {
    action: "Create a retro Halloween cat design.",
    reasoning: "Demand is accelerating while competition remains moderate.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-08-28T02:00:00.000Z",
} satisfies TrendCard;

class FakeUiEventSource implements UiEventSource {
  private queuedEvents: UiEvent[] = [];
  private resolveNext?: (result: IteratorResult<UiEvent>) => void;

  events(): AsyncIterable<UiEvent> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          const queuedEvent = this.queuedEvents.shift();

          if (queuedEvent) {
            return Promise.resolve({ done: false, value: queuedEvent });
          }

          return new Promise<IteratorResult<UiEvent>>((resolve) => {
            this.resolveNext = resolve;
          });
        },
      }),
    };
  }

  emit(event: UiEvent): void {
    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = undefined;
      resolve({ done: false, value: event });
      return;
    }

    this.queuedEvents.push(event);
  }
}

describe("LiveTheater", () => {
  it("reflects an injected UiEvent stream without opening a network connection", async () => {
    const eventSource = new FakeUiEventSource();

    render(<LiveTheater eventSource={eventSource} />);

    expect(screen.getByText("Waiting to start")).toBeInTheDocument();

    await act(async () => {
      eventSource.emit({
        id: "event-1",
        type: "scanning",
        source: "reddit",
      } satisfies UiEvent);
    });
    expect(await screen.findByText("Scanning Reddit")).toBeInTheDocument();

    await act(async () => {
      eventSource.emit({
        id: "event-2",
        type: "synthesizing",
        note: "Comparing demand and competition",
      } satisfies UiEvent);
    });
    expect(await screen.findByText("Synthesizing signals")).toBeInTheDocument();
    expect(screen.getByText("Comparing demand and competition")).toBeInTheDocument();

    await act(async () => {
      eventSource.emit({
        id: "event-3",
        type: "image:ready",
        url: "https://tos.example/generated.png",
      } satisfies UiEvent);
    });
    expect(
      await screen.findByRole("img", { name: "Generated preview" }),
    ).toHaveAttribute("src", "https://tos.example/generated.png");

    await act(async () => {
      eventSource.emit({
        id: "event-4",
        type: "card:ready",
        card: TREND_CARD,
      } satisfies UiEvent);
    });
    expect(await screen.findByText(TREND_CARD.seed)).toBeInTheDocument();
    expect(screen.getByText("84/100")).toBeInTheDocument();

    await act(async () => {
      eventSource.emit({
        id: "event-5",
        type: "error",
        recoverable: true,
        message: "TikTok is temporarily unavailable",
      } satisfies UiEvent);
    });
    expect(
      await screen.findByText("TikTok is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByText(TREND_CARD.seed)).toBeInTheDocument();

    await act(async () => {
      eventSource.emit({
        id: "event-6",
        type: "done",
      } satisfies UiEvent);
    });
    expect(await screen.findByText("Analysis complete")).toBeInTheDocument();
  });
});
