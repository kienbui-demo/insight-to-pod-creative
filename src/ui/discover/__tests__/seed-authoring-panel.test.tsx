import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrendCard } from "../../../../packages/contracts";
import type { BffRequest } from "../../../bff/types";
import { SeedAuthoringPanel } from "../seed-authoring-panel";

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
}));

const trendCard: TrendCard = {
  id: "card-xyz",
  market: "US",
  seed: "alpine folklore",
  productType: "t-shirt",
  opportunityScore: 82,
  confidence: 0.88,
  availableSources: ["google_trends"],
  missingSources: [],
  trendSeries: [{ t: "2026-09-01", v: 72 }],
  referenceImages: [],
  recommendation: {
    action: "Launch a focused collection",
    reasoning: "Demand is accelerating.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

function sseResponse(...events: unknown[]): Response {
  const frames = events.length > 0 ? events : [{ id: "done", type: "done" }];
  return new Response(
    frames.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

afterEach(() => {
  pushSpy.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SeedAuthoringPanel", () => {
  it("does not fetch on mount and disables submission until a topic is entered", () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(sseResponse());
    vi.stubGlobal("fetch", fetchSpy);

    render(<SeedAuthoringPanel />);

    const topic = screen.getByLabelText("Topic");
    const submit = screen.getByRole("button", {
      name: "Author trend card",
    });
    expect(topic).toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(topic, { target: { value: "  alpine folklore  " } });

    expect(submit).toBeEnabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits the selected seed as a live trend-card request", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(sseResponse());
    vi.stubGlobal("fetch", fetchSpy);

    render(<SeedAuthoringPanel />);

    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "  alpine folklore  " },
    });
    fireEvent.change(screen.getByLabelText("Market"), {
      target: { value: "DE" },
    });
    fireEvent.change(screen.getByLabelText("Product type"), {
      target: { value: "mug" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(typeof url).toBe("string");
    const parsedUrl = new URL(String(url), "http://localhost");
    const encodedRequest = parsedUrl.searchParams.get("request");
    expect(parsedUrl.pathname).toBe("/api/live");
    expect(encodedRequest).not.toBeNull();
    expect(JSON.parse(encodedRequest ?? "null") as BffRequest).toEqual({
      kind: "trend-card",
      crawl: {
        source: "google_trends",
        market: "DE",
        seed: "alpine folklore",
        productType: "mug",
        mode: "live",
      },
    });
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));
  });

  it("routes to the dashboard on card:ready", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(
      sseResponse(
        { id: "card-ready", type: "card:ready", card: trendCard },
        { id: "done", type: "done" },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<SeedAuthoringPanel />);

    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "alpine folklore" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/trends/card-xyz"),
    );
  });

  it("does not render a design image during authoring", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(
      sseResponse(
        {
          id: "image-ready",
          type: "image:ready",
          url: "https://example.com/x.png",
        },
        { id: "done", type: "done" },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<SeedAuthoringPanel />);

    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "alpine folklore" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(
        screen.queryByAltText(/generated (preview|design)/i),
      ).toBeNull(),
    );
  });
});
