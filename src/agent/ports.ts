import type { CrawlSource, TrendCard } from "../../packages/contracts";
import type { BffRequest } from "../bff/types";

export type GenerateDesignImageInput = {
  prompt: string;
  size: string;
  seed?: number;
};

export type GenerateDesignImageResult =
  | { ok: true; url: string }
  | { ok: false; recoverable: boolean; message: string };

export type ManagedAgentEvent =
  | {
      id: string;
      type: "agent.custom_tool_use";
      name: "crawl";
      input: { source: CrawlSource };
    }
  | { id: string; type: "agent.thinking"; note?: string }
  | {
      id: string;
      type: "user.custom_tool_result";
      custom_tool_use_id: string;
      name: "generate_design_image";
      input: GenerateDesignImageInput;
      result: GenerateDesignImageResult;
    }
  | {
      id: string;
      type: "agent.output";
      output: { kind: "trend_card"; card: TrendCard };
    }
  | {
      id: string;
      type: "session.error";
      error: {
        source?: CrawlSource;
        recoverable: boolean;
        message: string;
      };
    }
  | {
      id: string;
      type: "session.status_idle";
      stop_reason: { type: "end_turn" };
    }
  | { id: string; type: "span.model_request_start"; model: string };

export interface ManagedAgentSessionPort {
  history(): Promise<readonly ManagedAgentEvent[]>;
  openEvents(signal?: AbortSignal): AsyncIterable<ManagedAgentEvent>;
  send(request: BffRequest): Promise<void>;
  interrupt(reason?: unknown): Promise<void> | void;
  submitCustomToolResult(event: ManagedAgentEvent): Promise<void>;
}

export interface ManagedAgentClientPort {
  attachOrCreate(runId: string): Promise<ManagedAgentSessionPort>;
}

export interface SeedreamImagePort {
  generate(
    input: GenerateDesignImageInput,
    signal?: AbortSignal,
  ): Promise<GenerateDesignImageResult>;
}
