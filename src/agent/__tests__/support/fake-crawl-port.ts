import type {
  CrawlPort,
  CrawlPortInput,
  CrawlPortResult,
} from "../../ports";

export class FakeCrawlPort implements CrawlPort {
  readonly calls: Array<{
    input: CrawlPortInput;
    signal?: AbortSignal;
  }> = [];

  private resultIndex = 0;

  constructor(
    private readonly results: readonly CrawlPortResult[] = [
      { ok: true, records: [] },
    ],
  ) {}

  async fetch(
    input: CrawlPortInput,
    signal?: AbortSignal,
  ): Promise<CrawlPortResult> {
    this.calls.push({ input, signal });
    const result = this.results[this.resultIndex] ?? this.results.at(-1);
    this.resultIndex += 1;
    if (result === undefined) {
      throw new Error("FakeCrawlPort requires at least one result");
    }
    return result;
  }
}
