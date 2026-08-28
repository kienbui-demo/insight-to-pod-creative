export class ManualAsyncStream<T> implements AsyncIterable<T> {
  private readonly queued: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown;

  push(value: T): void {
    if (this.closed || this.failure !== undefined) {
      throw new Error("Cannot push into a completed async stream");
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
      return;
    }

    this.queued.push(value);
  }

  end(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.flushCompletion();
  }

  fail(error: unknown): void {
    if (this.closed || this.failure !== undefined) {
      return;
    }

    this.failure = error;
    this.flushCompletion();
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
      return: async () => {
        this.end();
        return { done: true, value: undefined };
      },
    };
  }

  private flushCompletion(): void {
    for (const waiter of this.waiters.splice(0)) {
      if (this.failure !== undefined) {
        waiter.reject(this.failure);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }
}

export async function collectAsync<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}
