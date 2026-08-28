import type { CrawlSource, TrendCard } from "../../../packages/contracts";
import type { RawMaEvent } from "../../bff/types";
import type {
  GenerateDesignImageInput,
  GenerateDesignImageResult,
  ManagedAgentEvent,
} from "../ports";

import { COMPLETE_TREND_CARD } from "./trend-card";

export const GENERATE_DESIGN_IMAGE_TOOL = {
  name: "generate_design_image",
  maxImagesPerAction: 1,
  input: {
    prompt: "A retro Halloween cat illustration for a screen-printed t-shirt",
    size: "2048x2048",
    seed: 7319,
  },
  result: {
    ok: true,
    url: "https://tos.example/generated/retro-halloween-cat.png",
  },
} as const satisfies {
  readonly name: "generate_design_image";
  readonly maxImagesPerAction: 1;
  readonly input: GenerateDesignImageInput;
  readonly result: GenerateDesignImageResult;
};

export const RECORDED_MANAGED_AGENT_EVENTS = [
  {
    id: "ma-001",
    type: "agent.custom_tool_use",
    name: "crawl",
    input: { source: "reddit" },
  },
  {
    id: "ma-002",
    type: "session.error",
    error: {
      source: "tiktok",
      recoverable: true,
      message: "TikTok timed out; continuing with remaining sources",
    },
  },
  {
    id: "ma-003",
    type: "agent.thinking",
    note: "Comparing demand with active-ad competition.",
  },
  {
    id: "ma-004",
    type: "user.custom_tool_result",
    custom_tool_use_id: "ma-seedream-call-001",
    name: GENERATE_DESIGN_IMAGE_TOOL.name,
    input: GENERATE_DESIGN_IMAGE_TOOL.input,
    result: GENERATE_DESIGN_IMAGE_TOOL.result,
  },
  {
    id: "ma-005",
    type: "agent.output",
    output: { kind: "trend_card", card: COMPLETE_TREND_CARD },
  },
  {
    id: "ma-006",
    type: "span.model_request_start",
    model: "managed-agent-model",
  },
] as const satisfies readonly ManagedAgentEvent[];

export const EXPECTED_RAW_MA_EVENTS = [
  {
    id: "ma-001",
    type: "tool_call",
    tool: "crawl",
    source: "reddit",
  },
  {
    id: "ma-002",
    type: "error",
    recoverable: true,
    message: "TikTok timed out; continuing with remaining sources",
  },
  {
    id: "ma-003",
    type: "synthesis_chunk",
    note: "Comparing demand with active-ad competition.",
  },
  {
    id: "ma-004",
    type: "seedream_image",
    url: "https://tos.example/generated/retro-halloween-cat.png",
  },
  {
    id: "ma-005",
    type: "final_card",
    card: COMPLETE_TREND_CARD,
  },
  {
    id: "ma-006",
    type: "unmapped",
    name: "span.model_request_start",
  },
] as const satisfies readonly RawMaEvent[];

export function sourceFailureTurn(
  source: CrawlSource,
  card: TrendCard,
): readonly ManagedAgentEvent[] {
  return [
    {
      id: `ma-${source}-error`,
      type: "session.error",
      error: {
        source,
        recoverable: true,
        message: `${source} unavailable; continuing with remaining sources`,
      },
    },
    {
      id: `ma-${source}-card`,
      type: "agent.output",
      output: { kind: "trend_card", card },
    },
    {
      id: `ma-${source}-end-turn`,
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    },
  ];
}
