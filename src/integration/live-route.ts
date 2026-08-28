import type { UiEvent } from "../../packages/contracts";
import { encodeSseEvent } from "../bff/sse-encoder";
import { handleBffRequest } from "../bff/router";
import type { BffDependencies, BffRequest } from "../bff/types";

interface LiveRequestBody {
  runId: string;
  reconnect: boolean;
  request: BffRequest;
}

const SSE_HEADERS = {
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "content-type": "text/event-stream; charset=utf-8",
  "x-accel-buffering": "no",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBody(value: unknown, requestUrl: string): LiveRequestBody {
  if (
    !isRecord(value) ||
    typeof value.runId !== "string" ||
    value.runId.length === 0 ||
    typeof value.reconnect !== "boolean"
  ) {
    throw new Error("Invalid live request");
  }

  let bffRequest = value.request;
  if (!isRecord(bffRequest)) {
    const encoded = new URL(requestUrl).searchParams.get("request");
    if (encoded) {
      bffRequest = JSON.parse(encoded) as unknown;
    }
  }
  if (!isRecord(bffRequest) || typeof bffRequest.kind !== "string") {
    throw new Error("Invalid live request");
  }

  return {
    runId: value.runId,
    reconnect: value.reconnect,
    request: bffRequest as unknown as BffRequest,
  };
}

function finiteUiEvents(events: readonly UiEvent[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encodeSseEvent(event));
      }
      controller.close();
    },
  });
}

export function createLivePostHandler(dependencies: BffDependencies) {
  return async function post(request: Request): Promise<Response> {
    const body = parseBody(await request.json(), request.url);
    const result = await handleBffRequest(
      body.request,
      {
        runId: body.runId,
        reconnect: body.reconnect,
        signal: request.signal,
      },
      dependencies,
    );

    if (result.kind === "card") {
      return new Response(
        finiteUiEvents([
          {
            id: `${body.runId}:card`,
            type: "card:ready",
            card: result.card,
          },
          { id: `${body.runId}:done`, type: "done" },
        ]),
        { status: 200, headers: SSE_HEADERS },
      );
    }

    return new Response(result.stream, {
      status: 200,
      headers: SSE_HEADERS,
    });
  };
}
