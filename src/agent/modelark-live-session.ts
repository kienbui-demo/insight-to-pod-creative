import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../bff/types";
import { mapManagedAgentEvents } from "./ma-event-mapper";
import type {
  ManagedAgentClientPort,
  ManagedAgentEvent,
  ManagedAgentSessionPort,
  SeedreamImagePort,
} from "./ports";

interface CreateModelArkLiveSessionPortOptions {
  client: ManagedAgentClientPort;
  seedream: SeedreamImagePort;
  maxImagesPerAction: 1;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly queued: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown;

  push(value: T): void {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
    } else {
      this.queued.push(value);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.flush();
  }

  fail(error: unknown): void {
    if (this.closed) {
      return;
    }

    this.failure = error;
    this.closed = true;
    this.flush();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.queued.shift();
        if (value !== undefined) {
          return Promise.resolve({ done: false, value });
        }
        if (this.failure !== undefined) {
          return Promise.reject(this.failure);
        }
        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }

  private flush(): void {
    for (const waiter of this.waiters.splice(0)) {
      if (this.failure !== undefined) {
        waiter.reject(this.failure);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }
}

class ModelArkLiveRun implements LiveRun {
  private readonly output = new AsyncEventQueue<RawMaEvent>();

  constructor(
    private readonly session: ManagedAgentSessionPort,
    rawEvents: AsyncIterable<ManagedAgentEvent>,
  ) {
    void this.pump(rawEvents);
  }

  async history(): Promise<readonly RawMaEvent[]> {
    const events = await this.session.history();
    return mapManagedAgentEvents(
      events.filter((event) => event.type !== "session.status_idle"),
    );
  }

  openEvents(signal?: AbortSignal): AsyncIterable<RawMaEvent> {
    if (signal?.aborted) {
      this.output.close();
    } else {
      signal?.addEventListener("abort", () => this.output.close(), { once: true });
    }
    return this.output;
  }

  async send(request: BffRequest): Promise<void> {
    await this.session.send(request);
  }

  async cancel(reason?: unknown): Promise<void> {
    await this.session.interrupt(reason);
    this.output.close();
  }

  private async pump(events: AsyncIterable<ManagedAgentEvent>): Promise<void> {
    try {
      for await (const event of events) {
        if (
          event.type === "session.status_idle" &&
          event.stop_reason.type === "end_turn"
        ) {
          this.output.close();
          return;
        }

        for (const mapped of mapManagedAgentEvents([event])) {
          this.output.push(mapped);
        }
      }
      this.output.close();
    } catch (error) {
      this.output.fail(error);
    }
  }
}

export function createModelArkLiveSessionPort(
  options: CreateModelArkLiveSessionPortOptions,
): LiveSessionPort {
  return {
    async create(runId: string): Promise<LiveRun> {
      const session = await options.client.attachOrCreate(runId);
      const rawEvents = session.openEvents();
      return new ModelArkLiveRun(session, rawEvents);
    },
  };
}
