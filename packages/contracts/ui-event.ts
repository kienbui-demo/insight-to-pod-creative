import type { CrawlSource } from "./crawl";
import type { TrendCard } from "./trend-card";

export type UiEvent =
  | { id: string; type: "scanning"; source: CrawlSource }
  | { id: string; type: "synthesizing"; note?: string }
  | { id: string; type: "image:ready"; url: string }
  | { id: string; type: "card:ready"; card: TrendCard }
  | { id: string; type: "error"; recoverable: boolean; message: string }
  | { id: string; type: "done" };
