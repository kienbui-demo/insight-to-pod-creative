import type { UiEvent } from "../../../packages/contracts";
import type { ManagedAgentEvent } from "../ports";

import { COMPLETE_TREND_CARD } from "./trend-card";

export const PROVISIONAL_MODELARK_RECORDING = {
  fixtureStatus: "provisional",
  events: [
    {
      id: "ma-c1-001",
      type: "agent.custom_tool_use",
      name: "crawl",
      input: { source: "reddit" },
    },
    {
      id: "ma-c1-002",
      type: "session.error",
      error: {
        source: "tiktok",
        recoverable: true,
        message: "TikTok unavailable; continuing with remaining sources",
      },
    },
    {
      id: "ma-c1-003",
      type: "agent.thinking",
      note: "Comparing remaining source signals",
    },
    {
      id: "ma-c1-004",
      type: "user.custom_tool_result",
      custom_tool_use_id: "ma-seedream-call-c1",
      name: "generate_design_image",
      input: {
        prompt: "A retro Halloween cat illustration",
        size: "2048x2048",
        seed: 7319,
      },
      result: {
        ok: true,
        url: "https://tos.example/generated/c1-halloween-cat.png",
      },
    },
    {
      id: "ma-c1-005",
      type: "agent.output",
      output: { kind: "trend_card", card: COMPLETE_TREND_CARD },
    },
    {
      id: "ma-c1-006",
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    },
  ],
} as const satisfies {
  fixtureStatus: "provisional";
  events: readonly ManagedAgentEvent[];
};

export const EXPECTED_C1_UI_EVENTS = [
  { id: "ma-c1-001", type: "scanning", source: "reddit" },
  {
    id: "ma-c1-002",
    type: "error",
    recoverable: true,
    message: "TikTok unavailable; continuing with remaining sources",
  },
  {
    id: "ma-c1-003",
    type: "synthesizing",
    note: "Comparing remaining source signals",
  },
  {
    id: "ma-c1-004",
    type: "image:ready",
    url: "https://tos.example/generated/c1-halloween-cat.png",
  },
  {
    id: "ma-c1-005",
    type: "card:ready",
    card: COMPLETE_TREND_CARD,
  },
  { id: "run-c1-g4:done", type: "done" },
] as const satisfies readonly UiEvent[];
