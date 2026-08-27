import type {
  CrawlRequest,
  CrawlSource,
  TrendCard,
} from "../../packages/contracts";

/**
 * B6-local, provisional semantic boundary for raw Managed Agent events.
 * Phase C must adapt the concrete ModelArk SDK event shapes into this union.
 */
export type RawMaEvent =
  | {
      id: string;
      type: "tool_call";
      tool: "crawl";
      source: CrawlSource;
    }
  | { id: string; type: "synthesis_chunk"; note?: string }
  | { id: string; type: "seedream_image"; url: string }
  | { id: string; type: "final_card"; card: TrendCard }
  | {
      id: string;
      type: "error";
      recoverable: boolean;
      message: string;
    }
  | { id: string; type: "unmapped"; name: string };

export type BffRequest =
  | { kind: "trend-card"; crawl: CrawlRequest }
  | { kind: "generate-design"; crawl: CrawlRequest }
  | { kind: "deep-dive"; crawl: CrawlRequest; question: string };

export interface BffRequestContext {
  runId: string;
  reconnect: boolean;
  signal?: AbortSignal;
}

export type TrendCardLookupResult =
  | { kind: "hit"; card: TrendCard }
  | { kind: "miss" };

export interface TrendCardLookupPort {
  lookup(request: CrawlRequest): Promise<TrendCardLookupResult>;
}

export interface LiveRun {
  history(): Promise<readonly RawMaEvent[]>;
  openEvents(signal?: AbortSignal): AsyncIterable<RawMaEvent>;
  send(request: BffRequest): Promise<void>;
  cancel?(reason?: unknown): Promise<void> | void;
}

export interface LiveSessionPort {
  create(runId: string): Promise<LiveRun>;
}

export interface BffDependencies {
  lookup: TrendCardLookupPort;
  liveSessions: LiveSessionPort;
}

export type BffResult =
  | { kind: "card"; card: TrendCard }
  | { kind: "stream"; stream: ReadableStream<Uint8Array> };
