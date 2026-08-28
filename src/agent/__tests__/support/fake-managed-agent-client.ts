import type { BffRequest } from "../../../bff/types";
import type { ManagedAgentEvent } from "../../ports";

import { ManualAsyncStream } from "./manual-async-stream";

export interface ManagedAgentSessionPortFakeContract {
  history(): Promise<readonly ManagedAgentEvent[]>;
  openEvents(signal?: AbortSignal): AsyncIterable<ManagedAgentEvent>;
  send(request: BffRequest): Promise<void>;
  interrupt(reason?: unknown): Promise<void>;
  submitCustomToolResult(event: ManagedAgentEvent): Promise<void>;
}

export interface ManagedAgentClientPortFakeContract {
  attachOrCreate(runId: string): Promise<ManagedAgentSessionPortFakeContract>;
}

export class FakeManagedAgentSession implements ManagedAgentSessionPortFakeContract {
  readonly events = new ManualAsyncStream<ManagedAgentEvent>();
  readonly order: string[] = [];
  readonly sent: BffRequest[] = [];
  readonly interrupts: unknown[] = [];
  readonly submittedToolResults: ManagedAgentEvent[] = [];

  constructor(private readonly historicalEvents: readonly ManagedAgentEvent[] = []) {}

  async history(): Promise<readonly ManagedAgentEvent[]> {
    this.order.push("history");
    return this.historicalEvents;
  }

  openEvents(signal?: AbortSignal): AsyncIterable<ManagedAgentEvent> {
    this.order.push("open");
    if (signal?.aborted) {
      this.events.end();
    } else {
      signal?.addEventListener("abort", () => this.events.end(), { once: true });
    }
    return this.events;
  }

  async send(request: BffRequest): Promise<void> {
    this.order.push("send");
    this.sent.push(request);
  }

  async interrupt(reason?: unknown): Promise<void> {
    this.order.push("interrupt");
    this.interrupts.push(reason);
    this.events.end();
  }

  async submitCustomToolResult(event: ManagedAgentEvent): Promise<void> {
    this.order.push("tool-result");
    this.submittedToolResults.push(event);
  }
}

export class FakeManagedAgentClient implements ManagedAgentClientPortFakeContract {
  readonly attachedRunIds: string[] = [];

  constructor(readonly session = new FakeManagedAgentSession()) {}

  async attachOrCreate(runId: string): Promise<ManagedAgentSessionPortFakeContract> {
    this.attachedRunIds.push(runId);
    return this.session;
  }
}
