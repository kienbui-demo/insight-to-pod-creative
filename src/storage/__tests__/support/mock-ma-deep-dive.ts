import type { CrawlRequest, TrendCard } from "../../../../packages/contracts";

export class MockMaDeepDive {
  readonly calls: CrawlRequest[] = [];

  constructor(private readonly result: TrendCard) {}

  async run(request: CrawlRequest): Promise<TrendCard> {
    this.calls.push(request);
    return this.result;
  }
}
