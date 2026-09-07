import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TrendCard } from "../../../../packages/contracts";
import { DesignStudioScreen } from "../design-studio-screen";
import type {
  PersistedDesign,
  PersistedRun,
  StudioHistoryStore,
} from "../studio-persistence";

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

beforeEach(() => {
  window.sessionStorage.clear();
});

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

  it("renders the full draft-design brief reasoning inside the concept panel", () => {
    render(<DesignStudioScreen card={CARD} />);

    const concept = screen.getByLabelText("Draft design concept");
    expect(
      within(concept).getByText(CARD.recommendation.action),
    ).toBeInTheDocument();
    expect(
      within(concept).getByText(CARD.recommendation.reasoning),
    ).toBeInTheDocument();
  });

  it("renders a 'Served from warehouse' badge inside the concept panel", () => {
    render(<DesignStudioScreen card={CARD} />);

    const concept = screen.getByLabelText("Draft design concept");
    expect(
      within(concept).getByText(/served from warehouse/i),
    ).toBeInTheDocument();
  });

  it("does not render the concept-panel Generate button", () => {
    render(<DesignStudioScreen card={CARD} />);

    expect(
      screen.queryByRole("button", { name: "Generate design from concept" }),
    ).toBeNull();
  });

  it("still resolves a single 'Generate design' button (right-panel empty state)", () => {
    render(<DesignStudioScreen card={CARD} />);

    expect(() =>
      screen.getByRole("button", { name: "Generate design" }),
    ).not.toThrow();
  });

  it("shows the generation loading bar while a run is in flight before the image arrives", async () => {
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

    expect(
      await screen.findByText("Đang tạo ảnh thiết kế ..."),
    ).toBeInTheDocument();
  });

  it("renders the generated image through the /api/design-image proxy once ready", async () => {
    const designAssetUrl =
      "https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/gen.png";
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          [
            `data: ${JSON.stringify({
              id: "image-ready",
              type: "image:ready",
              url: designAssetUrl,
            })}`,
            `data: ${JSON.stringify({ id: "done", type: "done" })}`,
            "",
          ].join("\n\n"),
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

    const result = await screen.findByLabelText("Design result");
    const image = await within(result).findByRole("img");
    const src = image.getAttribute("src") ?? "";
    expect(src.startsWith("/api/design-image?src=")).toBe(true);
    expect(new URL(src, "http://localhost").searchParams.get("src")).toBe(
      designAssetUrl,
    );
  });

  it("auto-resumes an in-flight run on mount without minting a new runId", async () => {
    const runs = [
      {
        runId: "run-inflight-1",
        status: "in-flight",
        startedAt: "2026-09-07T03:00:00.000Z",
      },
    ] satisfies PersistedRun[];
    const savedRuns: PersistedRun[] = [];
    const store: StudioHistoryStore = {
      load: () => [],
      append: () => undefined,
      loadRuns: () => runs,
      saveRun: (_cardId, run) => {
        savedRuns.push(run);
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

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body)).runId).toBe("run-inflight-1");
    expect(savedRuns).toEqual([]);
    expect(
      screen.queryByRole("heading", { name: "Generate your first draft" }),
    ).not.toBeInTheDocument();
  });

  it("resumes a completed run and shows its result without re-fetching", async () => {
    const designAssetUrl =
      "https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/gen.png";
    const store: StudioHistoryStore = {
      load: () => [],
      append: () => undefined,
      loadRuns: () => [
        {
          runId: "run-done-1",
          status: "done",
          startedAt: "2026-09-07T03:00:00.000Z",
          designAssetUrl,
        },
      ],
      saveRun: () => undefined,
    };
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);

    render(<DesignStudioScreen card={CARD} historyStore={store} />);

    const result = await screen.findByLabelText("Design result");
    const image = within(result).getByRole("img");
    const src = image.getAttribute("src") ?? "";
    expect(src.startsWith("/api/design-image?src=")).toBe(true);
    expect(new URL(src, "http://localhost").searchParams.get("src")).toBe(
      designAssetUrl,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders a task-history list and reopens a run on click", async () => {
    const doneAssetUrl =
      "https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/history.png";
    const runs = [
      {
        runId: "run-done-history",
        status: "done",
        startedAt: "2026-09-07T02:00:00.000Z",
        designAssetUrl: doneAssetUrl,
      },
      {
        runId: "run-inflight-history",
        status: "in-flight",
        startedAt: "2026-09-07T03:00:00.000Z",
      },
    ] satisfies PersistedRun[];
    const store: StudioHistoryStore = {
      load: () => [],
      append: () => undefined,
      loadRuns: () => runs,
      saveRun: () => undefined,
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

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const history = screen.getByLabelText("Task history");
    expect(within(history).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(
      within(history).getByRole("button", { name: /run-done-history/ }),
    );

    const result = screen.getByLabelText("Design result");
    const image = within(result).getByRole("img");
    const src = image.getAttribute("src") ?? "";
    expect(new URL(src, "http://localhost").searchParams.get("src")).toBe(
      doneAssetUrl,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores auto-resume for a legacy store without loadRuns", () => {
    const legacyStore: StudioHistoryStore = {
      load: () => [],
      append: () => undefined,
      loadRunId: () => "run-legacy-restored",
      saveRunId: () => undefined,
    };
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);

    render(<DesignStudioScreen card={CARD} historyStore={legacyStore} />);

    expect(
      screen.getByRole("heading", { name: "Generate your first draft" }),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
