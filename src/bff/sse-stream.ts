import type { UiEvent } from "../../packages/contracts";
import { encodeSseEvent } from "./sse-encoder";
import { translateRawMaEvent } from "./sse-translator";
import type { RawMaEvent } from "./types";

interface SseStreamOptions {
  runId: string;
  history: readonly RawMaEvent[];
  live: AsyncIterable<RawMaEvent>;
  signal?: AbortSignal;
  onCancel?(reason?: unknown): Promise<void> | void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSseStream(
  options: SseStreamOptions,
): ReadableStream<Uint8Array> {
  let iterator: AsyncIterator<RawMaEvent> | undefined;
  let stopped = false;
  let terminalEmitted = false;
  let iteratorClosed = false;
  let clientCancelled = false;

  async function closeIterator(): Promise<void> {
    if (iteratorClosed) {
      return;
    }
    iteratorClosed = true;
    await iterator?.return?.();
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const seen = new Set<string>();

      const enqueue = (event: UiEvent): boolean => {
        if (stopped || seen.has(event.id)) {
          return false;
        }
        seen.add(event.id);
        controller.enqueue(encodeSseEvent(event));
        return true;
      };

      const terminate = (event?: UiEvent): void => {
        if (terminalEmitted || stopped) {
          return;
        }
        terminalEmitted = true;
        if (event !== undefined) {
          enqueue(event);
        }
        stopped = true;
        controller.close();
      };

      const abort = (): void => {
        if (stopped) {
          return;
        }
        stopped = true;
        void closeIterator();
        if (!clientCancelled) {
          controller.close();
        }
      };

      options.signal?.addEventListener("abort", abort, { once: true });

      void (async () => {
        try {
          if (options.signal?.aborted) {
            abort();
            return;
          }

          for (const raw of options.history) {
            if (stopped) {
              return;
            }
            const event = translateRawMaEvent(raw);
            if (event === undefined || seen.has(event.id)) {
              continue;
            }
            enqueue(event);
            if (event.type === "error" && !event.recoverable) {
              terminate();
              return;
            }
          }

          iterator = options.live[Symbol.asyncIterator]();
          while (!stopped) {
            const next = await iterator.next();
            if (next.done) {
              terminate({ id: `${options.runId}:done`, type: "done" });
              return;
            }

            const event = translateRawMaEvent(next.value);
            if (event === undefined || seen.has(event.id)) {
              continue;
            }
            enqueue(event);
            if (event.type === "error" && !event.recoverable) {
              await closeIterator();
              terminate();
              return;
            }
          }
        } catch (error) {
          if (stopped) {
            return;
          }
          terminate({
            id: `${options.runId}:error`,
            type: "error",
            recoverable: false,
            message: errorMessage(error),
          });
        } finally {
          options.signal?.removeEventListener("abort", abort);
        }
      })();
    },
    async cancel(reason) {
      clientCancelled = true;
      stopped = true;
      await closeIterator();
      await options.onCancel?.(reason);
    },
  });
}
