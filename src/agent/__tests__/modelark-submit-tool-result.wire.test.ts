import { describe, expect, it } from "vitest";

import type {
  CreateRunSessionMapping,
  RunSessionMapping,
  RunSessionRepository,
} from "../../../packages/contracts";
import { InMemoryMetricSink } from "../../monitoring/in-memory-metric-sink";
import { ModelArkManagedAgentClient } from "../modelark-managed-agent-client";
import type { ManagedAgentEvent } from "../ports";

class InMemoryRunSessions implements RunSessionRepository {
  private mapping: RunSessionMapping | null = null;

  async findByRunId(): Promise<RunSessionMapping | null> {
    return this.mapping;
  }

  async saveIfAbsent(input: CreateRunSessionMapping): Promise<RunSessionMapping> {
    this.mapping ??= {
      ...input,
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    };
    return this.mapping;
  }
}

describe("ModelArk custom-tool-result wire format", () => {
  it("serializes successful and failed structured results as MA text content", async () => {
    const postedBodies: unknown[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v3/sessions")) {
        return Response.json({ id: "ma-session-wire" });
      }
      if (url.endsWith("/events") && init?.method === "POST") {
        expect(typeof init.body).toBe("string");
        postedBodies.push(JSON.parse(init.body as string) as unknown);
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    };
    const client = new ModelArkManagedAgentClient({
      baseUrl: "https://modelark.example",
      apiKey: "test-key",
      agentId: "agent-id",
      agentVersion: 1,
      environmentId: "environment-id",
      runSessions: new InMemoryRunSessions(),
      fetch,
      metricSink: new InMemoryMetricSink(),
    });
    const session = await client.attachOrCreate("run-tool-result-wire");
    const successEvent = {
      id: "tool-result-wire",
      type: "user.custom_tool_result",
      custom_tool_use_id: "tuse-1",
      name: "generate_design_image",
      input: { prompt: "retro cat", size: "2048x2048" },
      result: { ok: true, url: "https://example.test/img.png" },
    } satisfies ManagedAgentEvent;
    const errorEvent = {
      id: "tool-result-wire-error",
      type: "user.custom_tool_result",
      custom_tool_use_id: "tuse-2",
      name: "generate_design_image",
      input: { prompt: "retro cat", size: "2048x2048" },
      result: {
        ok: false,
        recoverable: true,
        message: "image generation unavailable",
      },
    } satisfies ManagedAgentEvent;

    await session.submitCustomToolResult(successEvent);
    await session.submitCustomToolResult(errorEvent);

    expect(postedBodies[0]).toEqual({
      events: [
        {
          id: "tool-result-wire",
          type: "user.custom_tool_result",
          custom_tool_use_id: "tuse-1",
          content: [{ type: "text", text: JSON.stringify(successEvent.result) }],
          is_error: false,
        },
      ],
    });
    expect(postedBodies[1]).toEqual({
      events: [
        {
          id: "tool-result-wire-error",
          type: "user.custom_tool_result",
          custom_tool_use_id: "tuse-2",
          content: [{ type: "text", text: JSON.stringify(errorEvent.result) }],
          is_error: true,
        },
      ],
    });
  });
});
