import type {
  CanonicalRecord,
  CrawlRequest,
  CrawlSource,
  SourceAdapter,
} from "../../../../packages/contracts";

interface FakeSourceAdapterOptions {
  adaptError?: Error;
  normalizeError?: Error;
}

export class FakeSourceAdapter implements SourceAdapter {
  readonly adaptCalls: CrawlRequest[] = [];
  readonly normalizeCalls: unknown[] = [];

  constructor(
    readonly source: CrawlSource,
    private readonly options: FakeSourceAdapterOptions = {},
  ) {}

  adapt(request: CrawlRequest): unknown {
    this.adaptCalls.push(request);
    if (this.options.adaptError) {
      throw this.options.adaptError;
    }
    return { source: this.source, request };
  }

  normalize(providerOutput: unknown): CanonicalRecord[] {
    this.normalizeCalls.push(providerOutput);
    if (this.options.normalizeError) {
      throw this.options.normalizeError;
    }
    return Array.isArray(providerOutput)
      ? (providerOutput as CanonicalRecord[])
      : [];
  }
}

export function createFakeAdapters(
  sources: readonly CrawlSource[],
  options: Partial<Record<CrawlSource, FakeSourceAdapterOptions>> = {},
): Record<CrawlSource, FakeSourceAdapter> {
  return Object.fromEntries(
    sources.map((source) => [
      source,
      new FakeSourceAdapter(source, options[source]),
    ]),
  ) as Record<CrawlSource, FakeSourceAdapter>;
}
