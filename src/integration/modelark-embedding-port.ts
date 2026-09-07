import type { EmbeddingProvider } from "../storage/postgres-trend-card-repository";

export interface ModelArkEmbeddingProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions?: number;
  instructions?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

function readEmbedding(payload: unknown): readonly number[] {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("ModelArk response is missing an embedding.");
  }

  const data = Reflect.get(payload, "data");
  if (typeof data !== "object" || data === null) {
    throw new Error("ModelArk response is missing an embedding.");
  }

  const embedding = Reflect.get(data, "embedding");
  if (!Array.isArray(embedding)) {
    throw new Error("ModelArk response is missing an embedding.");
  }

  return embedding as number[];
}

export function createModelArkEmbeddingProvider(
  options: ModelArkEmbeddingProviderOptions,
): EmbeddingProvider {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/api/v3/embeddings/multimodal`;
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    async embed(
      seed: string,
      signal?: AbortSignal,
    ): Promise<readonly number[]> {
      const body: Record<string, unknown> = {
        model: options.model,
        encoding_format: "float",
        input: [{ type: "text", text: seed }],
        dimensions: options.dimensions ?? 1024,
      };
      if (options.instructions !== undefined) {
        body.instructions = options.instructions;
      }

      const requestController = new AbortController();
      const abortFromCaller = () => requestController.abort();
      if (signal?.aborted) {
        abortFromCaller();
      } else {
        signal?.addEventListener("abort", abortFromCaller, { once: true });
      }
      const timeout = setTimeout(() => requestController.abort(), timeoutMs);

      try {
        const response = await fetchRequest(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: requestController.signal,
        });

        if (!response.ok) {
          throw new Error(
            `ModelArk embedding request failed with status ${response.status}.`,
          );
        }

        return readEmbedding(await response.json());
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
