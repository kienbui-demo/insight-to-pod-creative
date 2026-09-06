import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BffRequest } from "../../../bff/types";
import { SeedAuthoringPanel } from "../seed-authoring-panel";

function sseResponse(): Response {
  return new Response(
    `data: ${JSON.stringify({ id: "done", type: "done" })}\n\n`,
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

afterEach(() => {
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
});
