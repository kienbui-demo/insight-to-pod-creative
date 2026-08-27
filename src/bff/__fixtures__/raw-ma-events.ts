import type { TrendCard, UiEvent } from "../../../packages/contracts";
import type { RawMaEvent } from "../types";

export const RECORDED_TREND_CARD: TrendCard = {
  id: "trend_halloween_cats",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  opportunityScore: 84,
  confidence: 0.9,
  availableSources: ["google_trends", "reddit", "meta_ads"],
  missingSources: ["pinterest", "tiktok", "amazon", "etsy"],
  trendSeries: [{ t: "2026-08-20", v: 72 }],
  referenceImages: ["https://tos.example/halloween-cat.png"],
  competitors: [{ title: "Retro Cat Shirt", price: 24.99, adActive: true }],
  recommendation: {
    action: "Create a retro Halloween cat design.",
    reasoning: "Demand is accelerating ahead of the seasonal peak.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-08-27T08:00:00.000Z",
};

export const RECORDED_RAW_MA_EVENTS: readonly RawMaEvent[] = [
  {
    id: "ma-001",
    type: "tool_call",
    tool: "crawl",
    source: "reddit",
  },
  {
    id: "ma-ignored",
    type: "unmapped",
    name: "span.model_request_start",
  },
  {
    id: "ma-002",
    type: "synthesis_chunk",
    note: "Comparing demand with competition.",
  },
  {
    id: "ma-003",
    type: "seedream_image",
    url: "https://tos.example/draft.png",
  },
  {
    id: "ma-004",
    type: "final_card",
    card: RECORDED_TREND_CARD,
  },
];

export const EXPECTED_TRANSLATED_EVENTS: readonly UiEvent[] = [
  { id: "ma-001", type: "scanning", source: "reddit" },
  {
    id: "ma-002",
    type: "synthesizing",
    note: "Comparing demand with competition.",
  },
  {
    id: "ma-003",
    type: "image:ready",
    url: "https://tos.example/draft.png",
  },
  {
    id: "ma-004",
    type: "card:ready",
    card: RECORDED_TREND_CARD,
  },
];
