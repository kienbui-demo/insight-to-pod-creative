import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrendCard } from "../../../../packages/contracts";
import { DeepDiveScreen } from "../deep-dive-screen";

const CARD = {
  id: "trend-deep-dive",
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

describe("DeepDiveScreen", () => {
  it("lets the seller choose and submit a deep-dive question", async () => {
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

    render(<DeepDiveScreen card={CARD} />);

    const askButton = screen.getByRole("button", { name: "Ask" });
    const questionInput = screen.getByPlaceholderText(
      "Ask about this opportunity…",
    );
    expect(askButton).toBeDisabled();

    fireEvent.change(questionInput, {
      target: { value: "What signals support this trend?" },
    });
    expect(askButton).toBeEnabled();

    const suggestedQuestion = "Which audience should I target?";
    fireEvent.click(
      screen.getByRole("button", { name: suggestedQuestion }),
    );
    expect(questionInput).toHaveValue(suggestedQuestion);
    expect(askButton).toBeEnabled();

    expect(() => fireEvent.click(askButton)).not.toThrow();
    expect(screen.getByText("Waiting to start")).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  });
});
