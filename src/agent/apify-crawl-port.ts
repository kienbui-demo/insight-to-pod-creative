import type {
  CanonicalRecord,
  CrawlSource,
} from "../../packages/contracts";
import type {
  CrawlPort,
  CrawlPortInput,
  CrawlPortResult,
} from "./ports";

export type ApifyActorEntry = {
  actorSlug: string;
  enabled: boolean;
  buildInput: (input: CrawlPortInput) => Record<string, unknown>;
  normalize: (
    items: readonly unknown[],
    input: CrawlPortInput,
  ) => CanonicalRecord[];
};

export type ApifyCrawlRegistry = Partial<
  Record<CrawlSource, ApifyActorEntry>
>;

type AbortSource = "caller" | "timeout";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      Reflect.get(error, "name") === "AbortError")
  );
}

export function createApifyCrawlPort(options: {
  token: string;
  baseUrl: string;
  registry: ApifyCrawlRegistry;
  fetch?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  timeoutMs?: number;
}): CrawlPort {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    async fetch(
      input: CrawlPortInput,
      signal?: AbortSignal,
    ): Promise<CrawlPortResult> {
      const entry = options.registry[input.source];
      if (entry === undefined || !entry.enabled) {
        return {
          ok: false,
          recoverable: false,
          message: `No enabled Apify actor for source ${input.source}.`,
        };
      }

      const endpoint = `${options.baseUrl.replace(/\/$/, "")}/v2/acts/${entry.actorSlug.replace("/", "~")}/run-sync-get-dataset-items`;
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
            authorization: `Bearer ${options.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(entry.buildInput(input)),
          signal: requestController.signal,
        });

        if (!response.ok) {
          return {
            ok: false,
            recoverable: response.status === 429 || response.status >= 500,
            message: `Apify actor run failed with status ${response.status}.`,
          };
        }

        const items: unknown = await response.json();
        if (!Array.isArray(items)) {
          return {
            ok: false,
            recoverable: false,
            message: "Apify returned a non-array dataset.",
          };
        }

        return {
          ok: true,
          records: entry.normalize(items, input),
        };
      } catch (error) {
        if (isAbortError(error) || requestController.signal.aborted) {
          if (abortSource === "timeout") {
            return {
              ok: false,
              recoverable: true,
              message: "Apify actor run timed out.",
            };
          }
          return {
            ok: false,
            recoverable: true,
            message: "Apify actor run was aborted by the caller.",
          };
        }

        return {
          ok: false,
          recoverable: true,
          message: "Apify actor run failed unexpectedly.",
        };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
