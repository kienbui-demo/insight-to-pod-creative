import { createSseStream } from "./sse-stream";
import type {
  BffDependencies,
  BffRequest,
  BffRequestContext,
  BffResult,
} from "./types";

export async function handleBffRequest(
  request: BffRequest,
  context: BffRequestContext,
  dependencies: BffDependencies,
): Promise<BffResult> {
  if (request.kind === "trend-card") {
    const lookup = await dependencies.lookup.lookup(request.crawl);
    if (lookup.kind === "hit") {
      return { kind: "card", card: lookup.card };
    }
  }

  const run = await dependencies.liveSessions.create(context.runId);
  const history = context.reconnect ? await run.history() : [];
  const live = run.openEvents(context.signal);

  if (!context.reconnect) {
    await run.send(request);
  }

  return {
    kind: "stream",
    stream: createSseStream({
      runId: context.runId,
      history,
      live,
      signal: context.signal,
      onCancel: (reason) => run.cancel?.(reason),
    }),
  };
}
