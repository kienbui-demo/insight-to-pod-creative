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

  it("shows the draft design concept", () => {
    render(<DesignStudioScreen card={CARD} />);

    expect(screen.getByText(CARD.recommendation.action)).toBeInTheDocument();
    expect(screen.getByLabelText("Draft design concept")).toBeInTheDocument();
  });

  it("sends the seller prompt when provided", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
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

    fireEvent.change(screen.getByLabelText("Your prompt"), {
      target: { value: "make it neon" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate design" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    const encoded = new URL(calledUrl, "http://localhost").searchParams.get(
      "request",
    );
    const sent = JSON.parse(encoded!);
    expect(sent.kind).toBe("generate-design");
    expect(sent.sellerPrompt).toBe("make it neon");
  });

  it("omits sellerPrompt when the textarea is empty", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
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

    fireEvent.click(screen.getByRole("button", { name: "Generate design" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    const encoded = new URL(calledUrl, "http://localhost").searchParams.get(
      "request",
    );
    const sent = JSON.parse(encoded!);
    expect("sellerPrompt" in sent).toBe(false);
  });

  it("mints a fresh runId when generating after a reload restore", async () => {
    const RESTORED_RUN_ID = "run-restored-123";
    const saved: string[] = [];
    const seededStore: StudioHistoryStore = {
      load: (cardId) =>
        cardId === CARD.id
          ? [
              {
                runId: RESTORED_RUN_ID,
                designAssetUrl: "https://tos.example/a.png",
                createdAt: "2026-09-07T01:00:00.000Z",
              },
            ]
          : [],
      append: () => undefined,
      loadRunId: (cardId) =>
        cardId === CARD.id ? RESTORED_RUN_ID : undefined,
      saveRunId: (_cardId, runId) => {
        saved.push(runId);
      },
    };
    const fetchSpy = vi.fn<typeof fetch>(async () =>
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

    render(<DesignStudioScreen card={CARD} historyStore={seededStore} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate design" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.runId).not.toBe(RESTORED_RUN_ID);
    expect(typeof body.runId).toBe("string");
    expect(body.runId.length).toBeGreaterThan(0);
    expect(saved).toContain(body.runId);
  });

  it("reuses the in-session runId when nothing was restored", async () => {
    const savedIds: string[] = [];
    const store: StudioHistoryStore = {
      load: () => [],
      append: () => undefined,
      loadRunId: () => undefined,
      saveRunId: (_cardId, runId) => {
        savedIds.push(runId);
      },
    };
    const fetchSpy = vi.fn<typeof fetch>(async () =>
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

    render(<DesignStudioScreen card={CARD} historyStore={store} />);

    expect(savedIds).toHaveLength(1);
    const initialRunId = savedIds[0];
    fireEvent.click(screen.getByRole("button", { name: "Generate design" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.runId).toBe(initialRunId);
  });

  it("on reload, shows draft concept, generation history, and the studio layout", () => {
    const RESTORED_RUN_ID = "run-restored-123";
    const seededStore: StudioHistoryStore = {
      load: (cardId) =>
        cardId === CARD.id
          ? [
              {
                runId: RESTORED_RUN_ID,
                designAssetUrl: "https://tos.example/a.png",
                createdAt: "2026-09-07T01:00:00.000Z",
              },
            ]
          : [],
      append: () => undefined,
      loadRunId: (cardId) =>
        cardId === CARD.id ? RESTORED_RUN_ID : undefined,
      saveRunId: () => undefined,
    };

    render(<DesignStudioScreen card={CARD} historyStore={seededStore} />);

    expect(screen.getByLabelText("Draft design concept")).toBeInTheDocument();
    expect(screen.getByText(CARD.recommendation.action)).toBeInTheDocument();
    const history = screen.getByLabelText("Design history");
    expect(within(history).getAllByRole("img")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Generate design" }),
    ).toBeInTheDocument();
  });
});
