import type {
  MetricSink,
  MonitoringSseEventType,
  SseEventDisposition,
  SseStreamOutcome,
  UiEvent,
} from "../../packages/contracts";
import { NOOP_METRIC_SINK } from "../monitoring/no-op-metric-sink";
import { SafeMetricSink } from "../monitoring/safe-metric-sink";
import { encodeSseEvent } from "./sse-encoder";
import { translateRawMaEvent } from "./sse-translator";
import type { RawMaEvent } from "./types";

interface SseStreamOptions {
  runId: string;
  history: readonly RawMaEvent[];
  live: AsyncIterable<RawMaEvent>;
  signal?: AbortSignal;
  onCancel?(reason?: unknown): Promise<void> | void;
  metricSink?: MetricSink;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSseStream(
  options: SseStreamOptions,
): ReadableStream<Uint8Array> {
  const metricSink = new SafeMetricSink(
    options.metricSink ?? NOOP_METRIC_SINK,
  );
  let iterator: AsyncIterator<RawMaEvent> | undefined;
  let stopped = false;
  let terminalEmitted = false;
  let iteratorClosed = false;
  let clientCancelled = false;
  let streamOutcomeRecorded = false;

  const recordEvent = (
    eventType: MonitoringSseEventType,
    disposition: SseEventDisposition,
  ): void => {
    metricSink.record({
      name: "ptv_sse_event_total",
      kind: "counter",
      value: 1,
      labels: { eventType, disposition },
      observedAt: new Date().toISOString(),
    });
  };

  const recordStreamOutcome = (outcome: SseStreamOutcome): void => {
    if (streamOutcomeRecorded) {
      return;
    }
    streamOutcomeRecorded = true;
    metricSink.record({
      name: "ptv_sse_stream_total",
      kind: "counter",
      value: 1,
      labels: { outcome },
      observedAt: new Date().toISOString(),
    });
  };

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
        if (stopped) {
          return false;
        }
        if (seen.has(event.id)) {
          recordEvent(event.type, "deduplicated");
          return false;
        }
        seen.add(event.id);
        controller.enqueue(encodeSseEvent(event));
        recordEvent(event.type, "emitted");
        return true;
      };

      const terminate = (
        outcome: Extract<SseStreamOutcome, "done" | "fatal_error">,
        event?: UiEvent,
      ): void => {
        if (terminalEmitted || stopped) {
          return;
        }
        terminalEmitted = true;
        if (event !== undefined) {
          enqueue(event);
        }
        stopped = true;
        controller.close();
        recordStreamOutcome(outcome);
      };

      const abort = (): void => {
        if (stopped) {
          return;
        }
        stopped = true;
        void closeIterator();
        recordStreamOutcome("cancelled");
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
            if (event === undefined) {
              recordEvent("unmapped", "ignored_unmapped");
              continue;
            }
            enqueue(event);
            if (event.type === "error" && !event.recoverable) {
              terminate("fatal_error");
              return;
            }
          }

          iterator = options.live[Symbol.asyncIterator]();
          while (!stopped) {
            const next = await iterator.next();
            if (next.done) {
              terminate("done", {
                id: `${options.runId}:done`,
                type: "done",
              });
              return;
            }

            const event = translateRawMaEvent(next.value);
            if (event === undefined) {
              recordEvent("unmapped", "ignored_unmapped");
              continue;
            }
            enqueue(event);
            if (event.type === "error" && !event.recoverable) {
              await closeIterator();
              terminate("fatal_error");
              return;
            }
          }
        } catch (error) {
          if (stopped) {
            return;
          }
          terminate(
            "fatal_error",
            {
              id: `${options.runId}:error`,
              type: "error",
              recoverable: false,
              message: errorMessage(error),
            },
          );
        } finally {
          options.signal?.removeEventListener("abort", abort);
        }
      })();
    },
    async cancel(reason) {
      clientCancelled = true;
      stopped = true;
      recordStreamOutcome("cancelled");
      await closeIterator();
      await options.onCancel?.(reason);
    },
  });
}
