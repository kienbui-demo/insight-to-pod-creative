import { vi } from "vitest";

export class ControllableAsyncEvents<T> implements AsyncIterable<T> {
  private readonly queued: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private ended = false;
  private failure: unknown;

  readonly iteratorReturn = vi.fn(async (): Promise<IteratorResult<T>> => {
    this.ended = true;
    this.flushDone();
    return { done: true, value: undefined };
  });

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
      return;
    }

    this.queued.push(value);
  }

  end(): void {
    this.ended = true;
    this.flushDone();
  }

  fail(error: unknown): void {
    this.failure = error;
    this.flushDone();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const queued = this.queued.shift();
        if (queued !== undefined) {
          return Promise.resolve({ done: false, value: queued });
        }
        if (this.failure !== undefined) {
          return Promise.reject(this.failure);
        }
        if (this.ended) {
          return Promise.resolve({ done: true, value: undefined });
        }

        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
      return: this.iteratorReturn,
    };
  }

  private flushDone(): void {
    for (const waiter of this.waiters.splice(0)) {
      if (this.failure !== undefined) {
        waiter.reject(this.failure);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }
}

export async function readOneFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const result = await reader.read();
  if (result.done) {
    throw new Error("Expected an SSE frame before stream completion");
  }
  return new TextDecoder().decode(result.value);
}

export async function readRemaining(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const result = await reader.read();
    if (result.done) {
      return text;
    }
    text += decoder.decode(result.value, { stream: true });
  }
}
