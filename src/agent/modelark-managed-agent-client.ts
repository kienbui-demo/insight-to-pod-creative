import type {
  InfrastructureOperationOutcome,
  MetricSink,
  ModelArkOperation,
  RunSessionRepository,
} from "../../packages/contracts";
import type { BffRequest } from "../bff/types";
import { resolveRunSession } from "../integration/run-session-coordinator";
import { NOOP_METRIC_SINK } from "../monitoring/no-op-metric-sink";
import { SafeMetricSink } from "../monitoring/safe-metric-sink";
import type {
  GenerateDesignImageInput,
  GenerateDesignImageResult,
  ManagedAgentClientPort,
  ManagedAgentEvent,
  ManagedAgentSessionPort,
} from "./ports";

type FetchPort = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface ModelArkManagedAgentClientOptions {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  agentVersion: number;
  environmentId: string;
  runSessions: RunSessionRepository;
  fetch?: FetchPort;
  metricSink?: MetricSink;
  monitoringClock?: MonitoringClock;
}

interface MonitoringClock {
  nowIso(): string;
  nowMs(): number;
}

const REAL_MONITORING_CLOCK: MonitoringClock = {
  nowIso: () => new Date().toISOString(),
  nowMs: () => performance.now(),
};

function operationOutcome(
  error: unknown,
  signal?: AbortSignal,
): InfrastructureOperationOutcome {
  return signal?.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
    ? "cancelled"
    : "error";
}

function recordOperation(
  metricSink: MetricSink,
  clock: MonitoringClock,
  operation: ModelArkOperation,
  outcome: InfrastructureOperationOutcome,
  startedAt: number,
): void {
  const observedAt = clock.nowIso();
  metricSink.record({
    name: "ptv_infra_operation_total",
    kind: "counter",
    value: 1,
    labels: { component: "modelark", operation, outcome },
    observedAt,
  });
  metricSink.record({
    name: "ptv_infra_operation_duration_ms",
    kind: "distribution",
    value: Math.max(0, clock.nowMs() - startedAt),
    labels: { component: "modelark", operation, outcome },
    observedAt,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isCrawlSource(value: unknown): boolean {
  return (
    value === "google_trends" ||
    value === "reddit" ||
    value === "pinterest" ||
    value === "tiktok" ||
    value === "amazon" ||
    value === "etsy" ||
    value === "meta_ads"
  );
}

function isGenerateDesignInput(value: unknown): value is GenerateDesignImageInput {
  return (
    isRecord(value) &&
    isString(value.prompt) &&
    isString(value.size) &&
    (value.seed === undefined || typeof value.seed === "number")
  );
}

function isGenerateDesignResult(
  value: unknown,
): value is GenerateDesignImageResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  return value.ok
    ? isString(value.url)
    : typeof value.recoverable === "boolean" && isString(value.message);
}

export function decodeModelArkManagedAgentEvent(
  value: unknown,
): ManagedAgentEvent {
  if (!isRecord(value) || !isString(value.id) || !isString(value.type)) {
    throw new Error("Invalid provisional ModelArk event");
  }

  switch (value.type) {
    case "agent.custom_tool_use":
      if (
        value.name === "crawl" &&
        isRecord(value.input) &&
        isCrawlSource(value.input.source)
      ) {
        return value as unknown as ManagedAgentEvent;
      }
      break;
    case "agent.thinking":
      if (value.note === undefined || isString(value.note)) {
        return value as unknown as ManagedAgentEvent;
      }
      break;
    case "user.custom_tool_result":
      if (
        isString(value.custom_tool_use_id) &&
        value.name === "generate_design_image" &&
        isGenerateDesignInput(value.input) &&
        isGenerateDesignResult(value.result)
      ) {
        return value as unknown as ManagedAgentEvent;
      }
      break;
    case "agent.output":
      if (
        isRecord(value.output) &&
        value.output.kind === "trend_card" &&
        isRecord(value.output.card)
      ) {
        return value as unknown as ManagedAgentEvent;
      }
      break;
    case "session.error":
      if (
        isRecord(value.error) &&
        (value.error.source === undefined || isCrawlSource(value.error.source)) &&
        typeof value.error.recoverable === "boolean" &&
        isString(value.error.message)
      ) {
        return value as unknown as ManagedAgentEvent;
      }
      break;
    case "session.status_idle":
      if (
        isRecord(value.stop_reason) &&
        value.stop_reason.type === "end_turn"
      ) {
        return value as unknown as ManagedAgentEvent;
      }
      break;
    case "span.model_request_start":
      if (isString(value.model)) {
        return value as unknown as ManagedAgentEvent;
      }
      break;
  }

  throw new Error("Invalid provisional ModelArk event");
}

function jsonHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function sessionUrl(baseUrl: string, sessionId: string, suffix = ""): string {
  return `${baseUrl.replace(/\/$/, "")}/api/v3/sessions/${encodeURIComponent(sessionId)}${suffix}`;
}

async function expectOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(`ModelArk request failed with status ${response.status}`);
  }
  return response;
}

function parseSseData(frame: string): unknown | undefined {
  const data = frame
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());
  return data.length === 0 ? undefined : (JSON.parse(data.join("\n")) as unknown);
}

async function* readManagedAgentSse(
  response: Response,
): AsyncIterable<ManagedAgentEvent> {
  if (!response.body) {
    throw new Error("ModelArk event stream has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const value = parseSseData(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (value !== undefined) {
          yield decodeModelArkManagedAgentEvent(value);
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) {
      const value = parseSseData(buffer);
      if (value !== undefined) {
        yield decodeModelArkManagedAgentEvent(value);
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The upstream stream may already be closed or errored.
    }
  }
}

class ModelArkManagedAgentSession implements ManagedAgentSessionPort {
  constructor(
    private readonly sessionId: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchPort: FetchPort,
    private readonly metricSink: MetricSink,
    private readonly monitoringClock: MonitoringClock,
  ) {}

  private async measured<T>(
    operation: ModelArkOperation,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const startedAt = this.monitoringClock.nowMs();
    try {
      const result = await task();
      recordOperation(
        this.metricSink,
        this.monitoringClock,
        operation,
        "success",
        startedAt,
      );
      return result;
    } catch (error) {
      recordOperation(
        this.metricSink,
        this.monitoringClock,
        operation,
        operationOutcome(error, signal),
        startedAt,
      );
      throw error;
    }
  }

  async history(): Promise<readonly ManagedAgentEvent[]> {
    return this.measured("history_read", async () => {
      const response = await expectOk(
        await this.fetchPort(sessionUrl(this.baseUrl, this.sessionId, "/events"), {
          headers: { authorization: `Bearer ${this.apiKey}` },
        }),
      );
      const payload = (await response.json()) as unknown;
      const events = Array.isArray(payload)
        ? payload
        : isRecord(payload) && Array.isArray(payload.events)
          ? payload.events
          : isRecord(payload) && Array.isArray(payload.items)
            ? payload.items
            : [];
      return events.map(decodeModelArkManagedAgentEvent);
    });
  }

  openEvents(signal?: AbortSignal): AsyncIterable<ManagedAgentEvent> {
    const response = this.fetchPort(
      sessionUrl(this.baseUrl, this.sessionId, "/events/stream"),
      {
        headers: {
          accept: "text/event-stream",
          authorization: `Bearer ${this.apiKey}`,
        },
        signal,
      },
    ).then(expectOk);

    const metricSink = this.metricSink;
    const clock = this.monitoringClock;
    return (async function* () {
      const startedAt = clock.nowMs();
      try {
        yield* readManagedAgentSse(await response);
        recordOperation(metricSink, clock, "event_stream", "success", startedAt);
      } catch (error) {
        recordOperation(
          metricSink,
          clock,
          "event_stream",
          operationOutcome(error, signal),
          startedAt,
        );
        throw error;
      }
    })();
  }

  async send(request: BffRequest): Promise<void> {
    await this.measured("send", async () => {
      await expectOk(
        await this.fetchPort(sessionUrl(this.baseUrl, this.sessionId, "/events"), {
          method: "POST",
          headers: jsonHeaders(this.apiKey),
          body: JSON.stringify({
            events: [
              {
                type: "user.message",
                content: [{ type: "text", text: JSON.stringify(request) }],
              },
            ],
          }),
        }),
      );
    });
  }

  async interrupt(): Promise<void> {
    await this.measured("interrupt", async () => {
      await expectOk(
        await this.fetchPort(sessionUrl(this.baseUrl, this.sessionId, "/events"), {
          method: "POST",
          headers: jsonHeaders(this.apiKey),
          body: JSON.stringify({ events: [{ type: "user.interrupt" }] }),
        }),
      );
    });
  }

  async submitCustomToolResult(event: ManagedAgentEvent): Promise<void> {
    await this.measured("submit_tool_result", async () => {
      await expectOk(
        await this.fetchPort(sessionUrl(this.baseUrl, this.sessionId, "/events"), {
          method: "POST",
          headers: jsonHeaders(this.apiKey),
          body: JSON.stringify({ events: [event] }),
        }),
      );
    });
  }
}

export class ModelArkManagedAgentClient implements ManagedAgentClientPort {
  private readonly fetchPort: FetchPort;
  private readonly metricSink: MetricSink;
  private readonly monitoringClock: MonitoringClock;

  constructor(private readonly options: ModelArkManagedAgentClientOptions) {
    this.fetchPort = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.metricSink = new SafeMetricSink(
      options.metricSink ?? NOOP_METRIC_SINK,
    );
    this.monitoringClock = options.monitoringClock ?? REAL_MONITORING_CLOCK;
  }

  async attachOrCreate(runId: string): Promise<ManagedAgentSessionPort> {
    const startedAt = this.monitoringClock.nowMs();
    try {
      const mapping = await resolveRunSession({
        runId,
        repository: this.options.runSessions,
        createMaSession: async () => {
          const response = await expectOk(
            await this.fetchPort(
              `${this.options.baseUrl.replace(/\/$/, "")}/api/v3/sessions`,
              {
                method: "POST",
                headers: jsonHeaders(this.options.apiKey),
                body: JSON.stringify({
                  agent: {
                    type: "agent",
                    id: this.options.agentId,
                    version: this.options.agentVersion,
                  },
                  environment_id: this.options.environmentId,
                }),
              },
            ),
          );
          const session = (await response.json()) as unknown;
          if (!isRecord(session) || !isString(session.id)) {
            throw new Error("ModelArk session response has no id");
          }
          return session.id;
        },
      });
      recordOperation(
        this.metricSink,
        this.monitoringClock,
        "session_attach_or_create",
        "success",
        startedAt,
      );
      return new ModelArkManagedAgentSession(
        mapping.maSessionId,
        this.options.baseUrl,
        this.options.apiKey,
        this.fetchPort,
        this.metricSink,
        this.monitoringClock,
      );
    } catch (error) {
      recordOperation(
        this.metricSink,
        this.monitoringClock,
        "session_attach_or_create",
        operationOutcome(error),
        startedAt,
      );
      throw error;
    }
  }
}
