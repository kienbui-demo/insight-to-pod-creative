import type {
  GenerateDesignImageInput,
  GenerateDesignImageResult,
  SeedreamImagePort,
} from "../agent/ports";

export interface ModelArkSeedreamImagePortOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  timeoutMs?: number;
}

type AbortSource = "caller" | "timeout";

function invalidReferenceResult(): GenerateDesignImageResult {
  return {
    ok: false,
    recoverable: false,
    message: "Seedream reference images must use non-empty URLs.",
  };
}

function readGeneratedUrl(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const data = Reflect.get(payload, "data");
  if (!Array.isArray(data) || data.length === 0) {
    return undefined;
  }

  const first = data[0];
  if (typeof first !== "object" || first === null) {
    return undefined;
  }

  const url = Reflect.get(first, "url");
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      Reflect.get(error, "name") === "AbortError")
  );
}

export function createModelArkSeedreamImagePort(
  options: ModelArkSeedreamImagePortOptions,
): SeedreamImagePort {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/api/v3/images/generations`;

  return {
    async generate(
      input: GenerateDesignImageInput,
      signal?: AbortSignal,
    ): Promise<GenerateDesignImageResult> {
      const referenceUrls: string[] = [];
      for (const reference of input.reference_image_sources ?? []) {
        if (
          reference.type !== "url" ||
          typeof reference.url !== "string" ||
          reference.url.length === 0
        ) {
          return invalidReferenceResult();
        }
        referenceUrls.push(reference.url);
      }

      const body: Record<string, unknown> = {
        model: options.model,
        prompt: input.prompt,
        size: input.size,
        response_format: "url",
        watermark: false,
      };
      if (input.seed !== undefined) {
        body.seed = input.seed;
      }
      if (referenceUrls.length === 1) {
        body.image = referenceUrls[0];
      } else if (referenceUrls.length > 1) {
        body.image = referenceUrls;
      }

      const requestController = new AbortController();
      let abortSource: AbortSource | undefined;
      const abortFromCaller = () => {
        if (abortSource === undefined) {
          abortSource = "caller";
          requestController.abort();
        }
      };

      if (signal?.aborted) {
        abortFromCaller();
      } else {
        signal?.addEventListener("abort", abortFromCaller, { once: true });
      }

      const timeout = setTimeout(() => {
        if (abortSource === undefined) {
          abortSource = "timeout";
          requestController.abort();
        }
      }, timeoutMs);

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
          return {
            ok: false,
            recoverable: response.status === 429 || response.status >= 500,
            message: `Seedream request failed with status ${response.status}.`,
          };
        }

        const generatedUrl = readGeneratedUrl(await response.json());
        if (generatedUrl === undefined) {
          return {
            ok: false,
            recoverable: false,
            message: "Seedream returned no generated image URL.",
          };
        }

        return { ok: true, url: generatedUrl };
      } catch (error) {
        if (isAbortError(error) || requestController.signal.aborted) {
          if (abortSource === "timeout") {
            return {
              ok: false,
              recoverable: true,
              message: "Seedream request timed out.",
            };
          }
          return {
            ok: false,
            recoverable: true,
            message: "Seedream request was aborted by the caller.",
          };
        }

        return {
          ok: false,
          recoverable: true,
          message: "Seedream request failed unexpectedly.",
        };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
