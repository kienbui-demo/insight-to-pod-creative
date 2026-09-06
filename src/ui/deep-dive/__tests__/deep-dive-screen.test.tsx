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

  it("starts a distinct live turn for each submitted question", async () => {
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
    const firstQuestion = "What signals support this trend?";
    const secondQuestion = "How should I position the follow-up design?";

    fireEvent.change(questionInput, { target: { value: firstQuestion } });
    fireEvent.click(askButton);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("Analysis complete")).toBeInTheDocument(),
    );

    fireEvent.change(questionInput, { target: { value: secondQuestion } });
    fireEvent.click(askButton);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByText(firstQuestion)).toBeInTheDocument();
    expect(screen.getByText(secondQuestion)).toBeInTheDocument();
  });

  it("does not yet persist prior turns across remount documents FR11 navigation persistence gap", async () => {
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

    const priorQuestion = "Will this question survive navigation?";
    const { unmount } = render(<DeepDiveScreen card={CARD} />);

    fireEvent.change(
      screen.getByPlaceholderText("Ask about this opportunity…"),
      { target: { value: priorQuestion } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(screen.getByText(priorQuestion)).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    unmount();
    render(<DeepDiveScreen card={CARD} />);

    expect(screen.queryByText(priorQuestion)).not.toBeInTheDocument();
  });
});
