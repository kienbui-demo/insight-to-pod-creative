import type {
  CreditAction,
  CreditDebitRequest,
  CreditDebitResult,
  UiEvent,
} from "../../packages/contracts";
import { encodeSseEvent } from "../bff/sse-encoder";
import { handleBffRequest } from "../bff/router";
import type {
  BffDependencies,
  BffRequest,
  BffResult,
  TrendCardLookupPort,
} from "../bff/types";

interface CreditGatePort {
  debit(request: CreditDebitRequest): Promise<CreditDebitResult>;
}

interface AuthenticatedSeller {
  sellerId: string;
}

interface MonetizedLiveDependencies extends BffDependencies {
  credits?: CreditGatePort;
  authenticateSeller?(request: Request): Promise<AuthenticatedSeller>;
}

type MeteredBffRequest = BffRequest & { idempotencyKey?: unknown };

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

function resultResponse(result: BffResult, runId: string): Response {
  if (result.kind === "card") {
    return new Response(
      finiteUiEvents([
        {
          id: `${runId}:card`,
          type: "card:ready",
          card: result.card,
        },
        { id: `${runId}:done`, type: "done" },
      ]),
      { status: 200, headers: SSE_HEADERS },
    );
  }

  return new Response(result.stream, {
    status: 200,
    headers: SSE_HEADERS,
  });
}

function jsonError(error: unknown, status: number): Response {
  return new Response(JSON.stringify(error), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const MISS_LOOKUP: TrendCardLookupPort = {
  async lookup() {
    return { kind: "miss" };
  },
};

export function createLivePostHandler(
  dependencies: MonetizedLiveDependencies,
) {
  return async function post(request: Request): Promise<Response> {
    const body = parseBody(await request.json(), request.url);
    const monetized =
      dependencies.credits !== undefined ||
      dependencies.authenticateSeller !== undefined;
    if (
      monetized &&
      (!dependencies.credits || !dependencies.authenticateSeller)
    ) {
      throw new Error("Incomplete monetization dependencies");
    }

    const context = {
      runId: body.runId,
      reconnect: body.reconnect,
      signal: request.signal,
    };
    if (!monetized) {
      return resultResponse(
        await handleBffRequest(body.request, context, dependencies),
        body.runId,
      );
    }

    let liveDependencies: BffDependencies = dependencies;
    if (body.request.kind === "trend-card") {
      const lookup = await dependencies.lookup.lookup(body.request.crawl);
      if (lookup.kind === "hit") {
        return resultResponse(
          { kind: "card", card: lookup.card },
          body.runId,
        );
      }
      liveDependencies = { ...dependencies, lookup: MISS_LOOKUP };
    }

    const meteredRequest = body.request as MeteredBffRequest;
    const action: CreditAction =
      body.request.kind === "generate-design"
        ? "generate_design"
        : "deep_analysis";
    if (
      typeof meteredRequest.idempotencyKey !== "string" ||
      meteredRequest.idempotencyKey.length === 0
    ) {
      throw new Error("Metered request requires an idempotencyKey");
    }

    const authenticated = await dependencies.authenticateSeller!(request);
    const debit = await dependencies.credits!.debit({
      sellerId: authenticated.sellerId,
      runId: body.runId,
      action,
      idempotencyKey: meteredRequest.idempotencyKey,
    });
    if (!debit.ok) {
      if ("decision" in debit) {
        return jsonError(debit.error, 402);
      }
      return jsonError(debit.error, 409);
    }

    return resultResponse(
      await handleBffRequest(body.request, context, liveDependencies),
      body.runId,
    );
  };
}
