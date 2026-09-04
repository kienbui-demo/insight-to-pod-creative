import { describe, expect, it, vi } from "vitest";

import type { EmbeddingProvider } from "../../storage/postgres-trend-card-repository";
import { createModelArkEmbeddingProvider } from "../modelark-embedding-port";

const BASE_URL = "https://ark.ap-southeast.bytepluses.com";
const API_KEY = "test-embedding-key";
const MODEL = "skylark-embedding-vision-251215";
const EMBEDDINGS_URL = `${BASE_URL}/api/v3/embeddings/multimodal`;

type FetchLike = typeof globalThis.fetch;

type AbortableEmbeddingProvider = EmbeddingProvider & {
  embed(seed: string, signal?: AbortSignal): Promise<readonly number[]>;
};

type ProviderOptions = {
  baseUrl?: string;
  dimensions?: number;
  instructions?: string;
  timeoutMs?: number;
};

function embeddingResponse(embedding: readonly number[]): Response {
  return new Response(
    JSON.stringify({
      created: 1,
      data: { embedding, object: "embedding" },
      id: "x",
      model: MODEL,
      object: "list",
      usage: { prompt_tokens: 3, total_tokens: 3 },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

function createProvider(
  fetch: FetchLike,
  options: ProviderOptions = {},
): AbortableEmbeddingProvider {
  return createModelArkEmbeddingProvider({
    baseUrl: options.baseUrl ?? BASE_URL,
    apiKey: API_KEY,
    model: MODEL,
    dimensions: options.dimensions,
    instructions: options.instructions,
    fetch,
    timeoutMs: options.timeoutMs,
  }) as AbortableEmbeddingProvider;
}

function requestInit(fetchMock: ReturnType<typeof vi.fn<FetchLike>>): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1];
  expect(init).toBeDefined();
  if (init === undefined) {
    throw new Error("expected fetch to receive request init");
  }
  return init;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<FetchLike>>): unknown {
  return JSON.parse(requestInit(fetchMock).body as string);
}

function abortAwarePendingFetch(): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async (_input, init) => {
    const signal = init?.signal;
    if (!(signal instanceof AbortSignal)) {
      throw new Error("expected an AbortSignal");
    }

    return new Promise<Response>((_resolve, reject) => {
      const rejectAsAborted = () => {
        reject(new DOMException("embedding request aborted", "AbortError"));
      };
      if (signal.aborted) {
        rejectAsAborted();
        return;
      }
      signal.addEventListener("abort", rejectAsAborted, { once: true });
    });
  });
}

describe("createModelArkEmbeddingProvider", () => {
  it("posts the default multimodal embedding request with a normalized base URL", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(embeddingResponse([0.1, -0.2, 0.3]));
    const provider = createProvider(fetchMock, { baseUrl: `${BASE_URL}/` });

    await provider.embed("Retro Halloween Cats");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(EMBEDDINGS_URL);
    const init = requestInit(fetchMock);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(requestBody(fetchMock)).toEqual({
      model: MODEL,
      encoding_format: "float",
      input: [{ type: "text", text: "Retro Halloween Cats" }],
      dimensions: 1024,
    });
    expect(requestBody(fetchMock)).not.toHaveProperty("instructions");
  });

  it("passes instructions through exactly when provided", async () => {
    const instructions =
      "Target_modality: text.\nInstruction:Retrieve semantically similar text\nQuery:";
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(embeddingResponse([0.1, -0.2, 0.3]));
    const provider = createProvider(fetchMock, { instructions });

    await provider.embed("Retro Halloween Cats");

    expect(requestBody(fetchMock)).toEqual({
      model: MODEL,
      encoding_format: "float",
      input: [{ type: "text", text: "Retro Halloween Cats" }],
      dimensions: 1024,
      instructions,
    });
  });

  it("sends a custom dimensions value", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(embeddingResponse([0.1, -0.2, 0.3]));
    const provider = createProvider(fetchMock, { dimensions: 2048 });

    await provider.embed("Retro Halloween Cats");

    expect(requestBody(fetchMock)).toEqual({
      model: MODEL,
      encoding_format: "float",
      input: [{ type: "text", text: "Retro Halloween Cats" }],
      dimensions: 2048,
    });
  });

  it("reads the embedding from the response data object", async () => {
    const embedding = [0.1, -0.2, 0.3];
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(embeddingResponse(embedding));

    await expect(
      createProvider(fetchMock).embed("Retro Halloween Cats"),
    ).resolves.toEqual(embedding);
  });

  it("rejects when the caller signal is already aborted", async () => {
    const fetchMock = abortAwarePendingFetch();
    const provider = createProvider(fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.embed("Retro Halloween Cats", controller.signal),
    ).rejects.toThrow();
  });

  it("rejects when the internal timeout fires", async () => {
    const fetchMock = abortAwarePendingFetch();
    const provider = createProvider(fetchMock, { timeoutMs: 10 });

    await expect(provider.embed("Retro Halloween Cats")).rejects.toThrow();
    expect(requestInit(fetchMock).signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects a non-successful response with the HTTP status", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response("provider failure", { status: 500 }));

    await expect(
      createProvider(fetchMock).embed("Retro Halloween Cats"),
    ).rejects.toThrow(/500/);
  });

  it.each([
    {},
    { data: {} },
    { data: { object: "embedding" } },
    { data: { embedding: "not-an-array", object: "embedding" } },
  ])("rejects a successful response missing data.embedding %#", async (body) => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      createProvider(fetchMock).embed("Retro Halloween Cats"),
    ).rejects.toThrow(/embedding/i);
  });
});
