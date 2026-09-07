import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrendCard } from "../../../../packages/contracts";
import { DesignStudioScreen } from "../design-studio-screen";
import type { PersistedDesign, StudioHistoryStore } from "../studio-persistence";

const CARD = {
  id: "trend-studio",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  opportunityScore: 84,
  confidence: 0.91,
  availableSources: ["reddit", "amazon", "meta_ads"],
  missingSources: ["tiktok"],
  trendSeries: [{ t: "2026-08-27", v: 85 }],
  referenceImages: [],
  recommendation: {
    action: "Create a retro Halloween cat design.",
    reasoning: "Demand is accelerating.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-09-04T01:00:00.000Z",
} satisfies TrendCard;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DesignStudioScreen", () => {
  it("keeps publishing disabled until a generated image is ready", async () => {
    const fetchSpy = vi.fn(async () =>
      Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ id: "done", type: "done" })}\n\n`,
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<DesignStudioScreen card={CARD} />);

    expect(
      screen.getByRole("button", { name: "Publish to Printerval" }),
    ).toBeDisabled();

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Generate design" }));
    }).not.toThrow();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "Publish to Printerval" }),
    ).toBeDisabled();
  });

  it("restores previously generated designs from storage on mount", () => {
    const designs = [
      {
        runId: "run-studio",
        designAssetUrl: "https://tos.example/a.png",
        createdAt: "2026-09-07T01:00:00.000Z",
      },
      {
        runId: "run-studio",
        designAssetUrl: "https://tos.example/b.png",
        createdAt: "2026-09-07T02:00:00.000Z",
      },
    ] satisfies PersistedDesign[];
    const seededStore: StudioHistoryStore = {
      load: (cardId) => (cardId === CARD.id ? designs : []),
      append: () => undefined,
    };

    render(<DesignStudioScreen card={CARD} historyStore={seededStore} />);

    const history = screen.getByLabelText("Design history");
    const images = within(history).getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "https://tos.example/a.png",
      "https://tos.example/b.png",
    ]);
  });
});
