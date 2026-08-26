import type { CrawlRequest, CrawlSource } from "../../../../packages/contracts";
import type { CrawlTransport } from "../../types";

export interface CrawlTransportCall {
  source: CrawlSource;
  providerRequest: unknown;
  request: CrawlRequest;
}

interface FakeCrawlTransportOptions {
  outputs?: Partial<Record<CrawlSource, unknown>>;
  errors?: Partial<Record<CrawlSource, Error>>;
}

export class FakeCrawlTransport implements CrawlTransport {
  readonly calls: CrawlTransportCall[] = [];

  constructor(private readonly options: FakeCrawlTransportOptions = {}) {}

  async execute(
    source: CrawlSource,
    providerRequest: unknown,
    request: CrawlRequest,
  ): Promise<unknown> {
    this.calls.push({ source, providerRequest, request });
    const error = this.options.errors?.[source];
    if (error) {
      throw error;
    }
    return this.options.outputs?.[source] ?? [];
  }
}
