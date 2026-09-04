import { describe, expect, it, vi } from "vitest";

import type { CanonicalRecord } from "../../../packages/contracts";
import {
  createApifyCrawlPort,
  type ApifyActorEntry,
  type ApifyCrawlRegistry,
} from "../apify-crawl-port";
import type { CrawlPortInput } from "../ports";

const BASE_URL = "https://api.apify.example.test";
const TOKEN = "test-apify-token";
const ACTOR_SLUG = "crawloop/amazon-search-scraper";
const ACTOR_URL = `${BASE_URL}/v2/acts/crawloop~amazon-search-scraper/run-sync-get-dataset-items`;
const INPUT: CrawlPortInput = {
  source: "amazon",
  market: "US",
  seed: "retro halloween shirt",
  productType: "t-shirt",
  limit: 10,
};
const RECORD: CanonicalRecord = {
  source: "amazon",
  market: "US",
  seed: "retro halloween shirt",
  capturedAt: "2026-09-04T00:00:00.000Z",
  signalType: "demand",
  payload: { rank: 1 },
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function createEntry(enabled = true): ApifyActorEntry {
  return {
    actorSlug: ACTOR_SLUG,
    enabled,
    buildInput: vi.fn(() => ({
      query: INPUT.seed,
      market: INPUT.market,
      maxItems: INPUT.limit,
    })),
    normalize: vi.fn(() => [RECORD]),
  };
}

function createPort(
  fetch: FetchLike,
  registry: ApifyCrawlRegistry,
  timeoutMs = 60_000,
) {
  return createApifyCrawlPort({
    token: TOKEN,
    baseUrl: `${BASE_URL}/`,
    registry,
    fetch,
    timeoutMs,
  });
}

function requestInit(fetchMock: ReturnType<typeof vi.fn<FetchLike>>): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1];
  expect(init).toBeDefined();
  if (init === undefined) {
    throw new Error("expected fetch to receive request init");
  }
  return init;
}

async function expectFailure(
  resultPromise: ReturnType<ReturnType<typeof createPort>["fetch"]>,
  recoverable: boolean,
): Promise<string> {
  const result = await resultPromise;
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected Apify crawl to fail");
  }
  expect(result.recoverable).toBe(recoverable);
  return result.message;
}

function abortAwarePendingFetch(): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async (_input, init) => {
    const signal = init?.signal;
    if (!(signal instanceof AbortSignal)) {
      throw new Error("expected an AbortSignal");
    }

    return new Promise<Response>((_resolve, reject) => {
      const rejectAsAborted = () => {
        reject(new DOMException("request aborted", "AbortError"));
      };

      if (signal.aborted) {
        rejectAsAborted();
        return;
      }
      signal.addEventListener("abort", rejectAsAborted, { once: true });
    });
  });
}

describe("createApifyCrawlPort", () => {
  it("rejects a missing or disabled actor without calling fetch", async () => {
    const fetchMock = vi.fn<FetchLike>();
    const missingPort = createPort(fetchMock, {});
    const disabledPort = createPort(fetchMock, {
      amazon: createEntry(false),
    });

    await expect(missingPort.fetch(INPUT)).resolves.toEqual({
      ok: false,
      recoverable: false,
      message: "No enabled Apify actor for source amazon.",
    });
    await expect(disabledPort.fetch(INPUT)).resolves.toEqual({
      ok: false,
      recoverable: false,
      message: "No enabled Apify actor for source amazon.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the built input and normalizes returned dataset items", async () => {
    const items = [{ id: "item-1" }];
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response(JSON.stringify(items), { status: 200 }));
    const entry = createEntry();
    const port = createPort(fetchMock, { amazon: entry });

    await expect(port.fetch(INPUT)).resolves.toEqual({
      ok: true,
      records: [RECORD],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(ACTOR_URL);
    const init = requestInit(fetchMock);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(
      JSON.stringify({
        query: INPUT.seed,
        market: INPUT.market,
        maxItems: INPUT.limit,
      }),
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(entry.buildInput).toHaveBeenCalledOnce();
    expect(entry.buildInput).toHaveBeenCalledWith(INPUT);
    expect(entry.normalize).toHaveBeenCalledOnce();
    expect(entry.normalize).toHaveBeenCalledWith(items, INPUT);
  });

  it("classifies HTTP 500 as recoverable", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    const port = createPort(fetchMock, { amazon: createEntry() });

    await expect(port.fetch(INPUT)).resolves.toEqual({
      ok: false,
      recoverable: true,
      message: "Apify actor run failed with status 500.",
    });
  });

  it("classifies HTTP 400 as non-recoverable", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response(null, { status: 400 }));
    const port = createPort(fetchMock, { amazon: createEntry() });

    await expect(port.fetch(INPUT)).resolves.toEqual({
      ok: false,
      recoverable: false,
      message: "Apify actor run failed with status 400.",
    });
  });

  it("rejects a non-array dataset", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const port = createPort(fetchMock, { amazon: createEntry() });

    await expect(port.fetch(INPUT)).resolves.toEqual({
      ok: false,
      recoverable: false,
      message: "Apify returned a non-array dataset.",
    });
  });

  it("returns a recoverable caller-abort result", async () => {
    const fetchMock = abortAwarePendingFetch();
    const port = createPort(fetchMock, { amazon: createEntry() });
    const controller = new AbortController();
    controller.abort();

    const message = await expectFailure(
      port.fetch(INPUT, controller.signal),
      true,
    );

    expect(message).toMatch(/abort/i);
    expect(message).not.toMatch(/timed?\s*out|timeout/i);
  });

  it("returns a recoverable timeout result", async () => {
    const fetchMock = abortAwarePendingFetch();
    const port = createPort(fetchMock, { amazon: createEntry() }, 10);

    const message = await expectFailure(port.fetch(INPUT), true);

    expect(message).toMatch(/timed?\s*out|timeout/i);
  });
});
