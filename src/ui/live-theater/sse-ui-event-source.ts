import type {
  CrawlSource,
  TrendCard,
  UiEvent,
} from "../../../packages/contracts";
import type { BffRequest } from "../../bff/types";
import type { UiEventSource } from "./event-source";

type FetchPort = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface CreateSseUiEventSourceOptions {
  url: string;
  runId: string;
  request: BffRequest;
  fetch: FetchPort;
  maxReconnects?: number;
}

const CRAWL_SOURCES = new Set<CrawlSource>([
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCrawlSource(value: unknown): value is CrawlSource {
  return typeof value === "string" && CRAWL_SOURCES.has(value as CrawlSource);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTrendCard(value: unknown): value is TrendCard {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.market === "string" &&
    typeof value.seed === "string" &&
    (value.productType === undefined || typeof value.productType === "string") &&
    typeof value.opportunityScore === "number" &&
    typeof value.confidence === "number" &&
    Array.isArray(value.availableSources) &&
    value.availableSources.every(isCrawlSource) &&
    Array.isArray(value.missingSources) &&
    value.missingSources.every(isCrawlSource) &&
    Array.isArray(value.trendSeries) &&
    value.trendSeries.every(
      (point) =>
        isRecord(point) &&
        typeof point.t === "string" &&
        typeof point.v === "number",
    ) &&
    isStringArray(value.referenceImages) &&
    (value.competitors === undefined || Array.isArray(value.competitors)) &&
    isRecord(value.recommendation) &&
    typeof value.recommendation.action === "string" &&
    typeof value.recommendation.reasoning === "string" &&
    (value.freshnessTier === "hot" ||
      value.freshnessTier === "warm" ||
      value.freshnessTier === "cold") &&
    typeof value.updatedAt === "string"
  );
}

function parseUiEvent(value: unknown): UiEvent {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Invalid UiEvent");
  }

  switch (value.type) {
    case "scanning":
      if (isCrawlSource(value.source)) {
        return { id: value.id, type: "scanning", source: value.source };
      }
      break;
    case "synthesizing":
      if (value.note === undefined || typeof value.note === "string") {
        return value.note === undefined
          ? { id: value.id, type: "synthesizing" }
          : { id: value.id, type: "synthesizing", note: value.note };
      }
      break;
    case "image:ready":
      if (typeof value.url === "string") {
        return { id: value.id, type: "image:ready", url: value.url };
      }
      break;
    case "card:ready":
      if (isTrendCard(value.card)) {
        return { id: value.id, type: "card:ready", card: value.card };
      }
      break;
    case "error":
      if (
        typeof value.recoverable === "boolean" &&
        typeof value.message === "string"
      ) {
        return {
          id: value.id,
          type: "error",
          recoverable: value.recoverable,
          message: value.message,
        };
      }
      break;
    case "done":
      return { id: value.id, type: "done" };
  }

  throw new Error("Invalid UiEvent");
}

function eventData(frame: string): string | undefined {
  const lines = frame.replaceAll("\r\n", "\n").split("\n");
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());
  return data.length === 0 ? undefined : data.join("\n");
}

function requestUrl(url: string, request: BffRequest): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}request=${encodeURIComponent(JSON.stringify(request))}`;
}

export function createSseUiEventSource(
  options: CreateSseUiEventSourceOptions,
): UiEventSource {
  return {
    async *events(): AsyncIterable<UiEvent> {
      const seen = new Set<string>();
      const maxReconnects = options.maxReconnects ?? 0;
      let reconnects = 0;
      let reconnect = false;

      while (true) {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let completed = false;

        try {
          const response = await options.fetch(
            requestUrl(options.url, options.request),
            {
              method: "POST",
              headers: {
                accept: "text/event-stream",
                "content-type": "application/json",
              },
              body: JSON.stringify({ runId: options.runId, reconnect }),
            },
          );
          if (!response.ok || !response.body) {
            throw new Error(`SSE request failed with status ${response.status}`);
          }
          if (!response.headers.get("content-type")?.includes("text/event-stream")) {
            throw new Error("SSE response has an invalid content type");
          }

          reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
              buffer += decoder.decode();
              break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });

            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const data = eventData(frame);
              if (data !== undefined) {
                const event = parseUiEvent(JSON.parse(data) as unknown);
                if (!seen.has(event.id)) {
                  seen.add(event.id);
                  yield event;
                }
                if (
                  event.type === "done" ||
                  (event.type === "error" && !event.recoverable)
                ) {
                  completed = true;
                  return;
                }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }

          if (buffer.trim().length > 0) {
            const data = eventData(buffer);
            if (data !== undefined) {
              const event = parseUiEvent(JSON.parse(data) as unknown);
              if (!seen.has(event.id)) {
                seen.add(event.id);
                yield event;
              }
              if (
                event.type === "done" ||
                (event.type === "error" && !event.recoverable)
              ) {
                completed = true;
                return;
              }
            }
          }

          completed = true;
          return;
        } catch (error) {
          if (reconnects >= maxReconnects) {
            throw error;
          }
          reconnects += 1;
          reconnect = true;
        } finally {
          if (reader && !completed) {
            try {
              await reader.cancel();
            } catch {
              // An already errored stream has nothing left to cancel.
            }
          }
        }
      }
    },
  };
}
