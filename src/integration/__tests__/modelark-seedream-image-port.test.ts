import { describe, expect, it, vi } from "vitest";

import type { ReferenceImageSource } from "../../agent/ports";
import { createModelArkSeedreamImagePort } from "../modelark-seedream-image-port";

const BASE_URL = "https://ark.ap-southeast.bytepluses.com";
const API_KEY = "test-modelark-api-key";
const MODEL = "seedream-5-0-lite-260128";
const GENERATIONS_URL = `${BASE_URL}/api/v3/images/generations`;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function successfulResponse(url = "https://img.example/out.png"): Response {
  return new Response(JSON.stringify({ data: [{ url }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createPort(fetch: FetchLike, baseUrl = BASE_URL, timeoutMs = 60_000) {
  return createModelArkSeedreamImagePort({
    baseUrl,
    apiKey: API_KEY,
    model: MODEL,
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

async function expectSafeFailure(
  resultPromise: ReturnType<ReturnType<typeof createPort>["generate"]>,
  recoverable: boolean,
): Promise<string> {
  const result = await resultPromise;
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected Seedream generation to fail");
  }
  expect(result.recoverable).toBe(recoverable);
  expect(result.message.length).toBeGreaterThan(0);
  expect(result.message).not.toContain(API_KEY);
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
        reject(new DOMException(`request aborted ${API_KEY}`, "AbortError"));
      };

      if (signal.aborted) {
        rejectAsAborted();
        return;
      }
      signal.addEventListener("abort", rejectAsAborted, { once: true });
    });
  });
}

describe("createModelArkSeedreamImagePort", () => {
  it("posts the required Seedream request and returns its generated URL", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(successfulResponse());
    const port = createPort(fetchMock);

    await expect(port.generate({ prompt: "p", size: "2K" })).resolves.toEqual({
      ok: true,
      url: "https://img.example/out.png",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(GENERATIONS_URL);
    const init = requestInit(fetchMock);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      model: MODEL,
      prompt: "p",
      size: "2K",
      response_format: "url",
      watermark: false,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(successfulResponse());
    const port = createPort(fetchMock, `${BASE_URL}/`);

    await port.generate({ prompt: "p", size: "2K" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(GENERATIONS_URL);
  });

  it("passes a supplied seed through to Seedream", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(successfulResponse());
    const port = createPort(fetchMock);

    await port.generate({ prompt: "p", size: "2K", seed: 42 });

    expect(JSON.parse(requestInit(fetchMock).body as string)).toEqual({
      model: MODEL,
      prompt: "p",
      size: "2K",
      response_format: "url",
      watermark: false,
      seed: 42,
    });
  });

  it("sends one URL reference image as a string", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(successfulResponse());
    const port = createPort(fetchMock);

    await port.generate({
      prompt: "p",
      size: "2K",
      reference_image_sources: [{ type: "url", url: "https://a/1.png" }],
    });

    expect(JSON.parse(requestInit(fetchMock).body as string)).toEqual({
      model: MODEL,
      prompt: "p",
      size: "2K",
      response_format: "url",
      watermark: false,
      image: "https://a/1.png",
    });
  });

  it("sends multiple URL reference images as an array", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(successfulResponse());
    const port = createPort(fetchMock);

    await port.generate({
      prompt: "p",
      size: "2K",
      reference_image_sources: [
        { type: "url", url: "https://a/1.png" },
        { type: "url", url: "https://b/2.png" },
      ],
    });

    expect(JSON.parse(requestInit(fetchMock).body as string)).toEqual({
      model: MODEL,
      prompt: "p",
      size: "2K",
      response_format: "url",
      watermark: false,
      image: ["https://a/1.png", "https://b/2.png"],
    });
  });

  it.each([
    { type: "file", file_id: "file-1" },
    { type: "tos", tos_uri: "tos://bucket/object.png" },
  ] satisfies readonly ReferenceImageSource[])(
    "rejects a $type reference before making a request",
    async (reference) => {
      const fetchMock = vi.fn<FetchLike>();
      const port = createPort(fetchMock);

      await expectSafeFailure(
        port.generate({
          prompt: "p",
          size: "2K",
          reference_image_sources: [reference],
        }),
        false,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: 429, recoverable: true },
    { status: 500, recoverable: true },
    { status: 503, recoverable: true },
    { status: 400, recoverable: false },
    { status: 401, recoverable: false },
    { status: 403, recoverable: false },
  ])(
    "maps an HTTP $status response to recoverable=$recoverable without leaking secrets",
    async ({ status, recoverable }) => {
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: `provider rejected ${API_KEY}` } }),
          {
            status,
            headers: { "content-type": "application/json" },
          },
        ),
      );
      const port = createPort(fetchMock);

      await expectSafeFailure(
        port.generate({ prompt: "p", size: "2K" }),
        recoverable,
      );
    },
  );

  it.each([{ data: [] }, { data: [{}] }])(
    "rejects a successful response without data[0].url",
    async (body) => {
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const port = createPort(fetchMock);

      await expectSafeFailure(
        port.generate({ prompt: "p", size: "2K" }),
        false,
      );
    },
  );

  it("returns a recoverable, secret-safe timeout failure", async () => {
    const fetchMock = abortAwarePendingFetch();
    const port = createPort(fetchMock, BASE_URL, 10);

    const message = await expectSafeFailure(
      port.generate({ prompt: "p", size: "2K" }),
      true,
    );

    expect(message).toMatch(/timed?\s*out|timeout/i);
    expect(requestInit(fetchMock).signal).toBeInstanceOf(AbortSignal);
  });

  it("distinguishes a caller abort from an internal timeout", async () => {
    const fetchMock = abortAwarePendingFetch();
    const port = createPort(fetchMock, BASE_URL, 60_000);
    const controller = new AbortController();

    const result = port.generate({ prompt: "p", size: "2K" }, controller.signal);
    await Promise.resolve();
    controller.abort();
    const message = await expectSafeFailure(result, true);

    expect(message).toMatch(/abort/i);
    expect(message).not.toMatch(/timed?\s*out|timeout/i);
    expect(requestInit(fetchMock).signal).toBeInstanceOf(AbortSignal);
  });
});
