import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrendCard, UiEvent } from "../../../../packages/contracts";
import type { BffRequest } from "../../../bff/types";
import type { UiEventSource } from "../../live-theater/event-source";
import { SeedAuthoringPanel } from "../seed-authoring-panel";

const { pushSpy, eventSourceOverride } = vi.hoisted(() => ({
  pushSpy: vi.fn(),
  eventSourceOverride: {
    current: undefined as (() => unknown) | undefined,
  },
}));

vi.mock("../../live-theater/sse-ui-event-source", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../live-theater/sse-ui-event-source")
    >();

  return {
    ...actual,
    createSseUiEventSource: (
      ...args: Parameters<typeof actual.createSseUiEventSource>
    ) => {
      const override = eventSourceOverride.current;
      return override === undefined
        ? actual.createSseUiEventSource(...args)
        : (override() as ReturnType<typeof actual.createSseUiEventSource>);
    },
  };
});

type TestTask = {
  id: string;
  runId: string;
  seed: string;
  market: string;
  productType: string;
  status: "in-progress" | "done" | "failed";
  startedAt: string;
  cardId?: string;
};

function createTaskStore(initial: TestTask[] = []) {
  let tasks = [...initial];
  return {
    load: () => [...tasks],
    save(task: TestTask) {
      const existingIndex = tasks.findIndex(
        (persisted) => persisted.id === task.id,
      );
      if (existingIndex === -1) {
        tasks = [...tasks, task];
        return;
      }

      const nextTasks = [...tasks];
      nextTasks[existingIndex] = task;
      tasks = nextTasks;
    },
  };
}

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

function openSseResponse(...events: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

function eventSourceFrom(...events: UiEvent[]): UiEventSource {
  return {
    async *events() {
      yield* events;
    },
  };
}

function pendingEventSource(onCancel: () => void): UiEventSource {
  return {
    events() {
      return {
        [Symbol.asyncIterator]() {
          return {
            next: () => new Promise<IteratorResult<UiEvent>>(() => undefined),
            return: async () => {
              onCancel();
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
  };
}

afterEach(() => {
  eventSourceOverride.current = undefined;
  window.sessionStorage?.clear?.();
  pushSpy.mockReset();
  vi.useRealTimers();
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

  it("persists an in-progress task on submit", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(openSseResponse());
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore();

    render(<SeedAuthoringPanel taskStore={taskStore} />);

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

    await waitFor(() => {
      expect(taskStore.load()).toHaveLength(1);
      expect(taskStore.load()[0]).toEqual(
        expect.objectContaining({
          seed: "alpine folklore",
          market: "DE",
          productType: "mug",
          status: "in-progress",
        }),
      );
      expect(taskStore.load()[0]?.id).toBe(taskStore.load()[0]?.runId);
    });
  });

  it("flips a task to done and renders its dashboard link on card:ready", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(
      sseResponse(
        { id: "card-ready", type: "card:ready", card: trendCard },
        { id: "done", type: "done" },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore();

    render(<SeedAuthoringPanel taskStore={taskStore} />);

    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "alpine folklore" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() =>
      expect(taskStore.load()[0]).toEqual(
        expect.objectContaining({
          status: "done",
          cardId: "card-xyz",
        }),
      ),
    );
    expect(
      screen.getByRole("link", { name: /alpine folklore/i }),
    ).toHaveAttribute("href", "/trends/card-xyz");
    expect(pushSpy).toHaveBeenCalledWith("/trends/card-xyz");
  });

  it("renders a done task from the store on mount without fetching", () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(sseResponse());
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore([
      {
        id: "run-done-1",
        runId: "run-done-1",
        seed: "winter gifting",
        market: "GB",
        productType: "poster",
        status: "done",
        startedAt: "2026-09-09T02:00:00.000Z",
        cardId: "card-abc",
      },
    ]);

    render(<SeedAuthoringPanel taskStore={taskStore} />);

    expect(
      screen.getByRole("link", { name: /winter gifting/i }),
    ).toHaveAttribute("href", "/trends/card-abc");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resumes an in-progress task on mount", async () => {
    const resumedCard = { ...trendCard, id: "card-resumed", seed: "halloween" };
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(
      sseResponse(
        { id: "card-ready", type: "card:ready", card: resumedCard },
        { id: "done", type: "done" },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore([
      {
        id: "run-resume-1",
        runId: "run-resume-1",
        seed: "halloween",
        market: "US",
        productType: "t-shirt",
        status: "in-progress",
        startedAt: "2026-09-09T03:00:00.000Z",
      },
    ]);

    render(<SeedAuthoringPanel taskStore={taskStore} />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    const parsedUrl = new URL(String(url), "http://localhost");
    expect(parsedUrl.pathname).toBe("/api/live");
    expect(JSON.parse(String(init?.body))).toEqual({
      runId: "run-resume-1",
      reconnect: false,
    });
    expect(
      JSON.parse(parsedUrl.searchParams.get("request") ?? "null") as BffRequest,
    ).toEqual({
      kind: "trend-card",
      crawl: {
        source: "google_trends",
        market: "US",
        seed: "halloween",
        productType: "t-shirt",
        mode: "live",
      },
    });
    await waitFor(() =>
      expect(taskStore.load()[0]).toEqual(
        expect.objectContaining({
          status: "done",
          cardId: "card-resumed",
        }),
      ),
    );
    expect(pushSpy).toHaveBeenCalledWith("/trends/card-resumed");
  });

  it("renders a failed task as an error row", () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(sseResponse());
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore([
      {
        id: "run-failed-1",
        runId: "run-failed-1",
        seed: "spring florals",
        market: "US",
        productType: "mug",
        status: "failed",
        startedAt: "2026-09-09T04:00:00.000Z",
      },
    ]);

    render(<SeedAuthoringPanel taskStore={taskStore} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/spring florals/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the current scanning source in the active task and history row", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(
      openSseResponse({
        id: "scan-google",
        type: "scanning",
        source: "google_trends",
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore();

    render(<SeedAuthoringPanel taskStore={taskStore} />);
    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "alpine folklore" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() =>
      expect(screen.getAllByText(/Scanning Google Trends…/)).toHaveLength(2),
    );
    expect(taskStore.load()[0]?.status).toBe("in-progress");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("advances the task label through synthesis, image generation, and finalization", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(
      openSseResponse(
        { id: "synthesis", type: "synthesizing", note: "Combining signals" },
        {
          id: "image-ready",
          type: "image:ready",
          url: "https://example.com/private-design.png",
        },
        { id: "answer", type: "answer", text: "Private agent answer" },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore();

    render(<SeedAuthoringPanel taskStore={taskStore} />);
    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "alpine folklore" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() =>
      expect(screen.getAllByText(/Finalizing Trend Card…/)).toHaveLength(2),
    );
    expect(screen.queryByText("Private agent answer")).toBeNull();
    expect(
      screen.queryByAltText(/generated (preview|design)/i),
    ).toBeNull();
    expect(taskStore.load()[0]?.status).toBe("in-progress");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("keeps the existing terminal failure behavior after progress events", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(
      sseResponse(
        { id: "synthesis", type: "synthesizing" },
        {
          id: "fatal",
          type: "error",
          recoverable: false,
          message: "Unable to build the card",
        },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const taskStore = createTaskStore();

    render(<SeedAuthoringPanel taskStore={taskStore} />);
    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "alpine folklore" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() => expect(taskStore.load()[0]?.status).toBe("failed"));
    expect(screen.getByRole("alert")).toHaveTextContent(/alpine folklore/i);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("fails a task when the stream ends without producing a Trend Card", async () => {
    const taskStore = createTaskStore();
    eventSourceOverride.current = () =>
      eventSourceFrom(
        { id: "synthesis", type: "synthesizing" },
        {
          id: "answer",
          type: "answer",
          text: "The assistant answered in chat instead.",
        },
        { id: "done", type: "done" },
      );

    render(<SeedAuthoringPanel taskStore={taskStore} />);
    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "alpine folklore" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Author trend card" }),
    );

    await waitFor(() => expect(taskStore.load()[0]?.status).toBe("failed"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No Trend Card was produced — the assistant answered in chat.",
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/Creating your Trend Card…/i)).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("fails and cancels a task when the watchdog times out", async () => {
    vi.useFakeTimers();
    const cancelSpy = vi.fn();
    const taskStore = createTaskStore();
    eventSourceOverride.current = () => pendingEventSource(cancelSpy);
    const { unmount } = render(<SeedAuthoringPanel taskStore={taskStore} />);

    try {
      fireEvent.change(screen.getByLabelText("Topic"), {
        target: { value: "alpine folklore" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Author trend card" }),
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(taskStore.load()[0]?.status).toBe("in-progress");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(taskStore.load()[0]?.status).toBe("failed");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Trend Card creation timed out.",
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText(/Creating your Trend Card…/i)).toBeNull();
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).not.toHaveBeenCalled();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
});
