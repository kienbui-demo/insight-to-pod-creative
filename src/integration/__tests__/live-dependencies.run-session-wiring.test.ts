import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as modelarkLiveSessionModule from "../../agent/modelark-live-session";
import { ConsoleLogMetricSink } from "../../monitoring/console-log-sink";
import { InMemoryRunSessionRepository } from "../in-memory-run-session-repository";
import { buildLiveDependencies } from "../live-dependencies";
import { PostgresRunSessionRepository } from "../postgres-run-session-repository";

const { constructorArguments } = vi.hoisted(() => ({
  constructorArguments: [] as unknown[],
}));

vi.mock("../../agent/modelark-managed-agent-client", () => ({
  ModelArkManagedAgentClient: class {
    constructor(options: unknown) {
      constructorArguments.push(options);
    }
  },
}));

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  ARK_BASE_URL: "https://ark.example.test",
  ARK_API_KEY: "test-api-key",
  ARK_AGENT_ID: "test-agent-id",
  ARK_AGENT_VERSION: "7",
  ARK_ENVIRONMENT_ID: "test-environment-id",
};

function capturedRunSessions(): unknown {
  const options = constructorArguments.at(-1) as
    | { runSessions: unknown }
    | undefined;

  return options?.runSessions;
}

beforeEach(() => {
  constructorArguments.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildLiveDependencies run-session wiring", () => {
  it("constructs the ModelArk client with Postgres run sessions when DATABASE_URL is present", () => {
    buildLiveDependencies({
      ...VALID_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });

    expect(constructorArguments).toHaveLength(1);
    expect(capturedRunSessions()).toBeInstanceOf(
      PostgresRunSessionRepository,
    );
  });

  it("constructs the ModelArk client with in-memory run sessions when DATABASE_URL is absent", () => {
    buildLiveDependencies(VALID_ENV);

    expect(constructorArguments).toHaveLength(1);
    expect(capturedRunSessions()).toBeInstanceOf(
      InMemoryRunSessionRepository,
    );
  });

  it("threads one console logging sink through the route, ModelArk client, and live session", () => {
    const liveSessionFactory = vi.spyOn(
      modelarkLiveSessionModule,
      "createModelArkLiveSessionPort",
    );

    const dependencies = buildLiveDependencies(VALID_ENV);
    const clientOptions = constructorArguments.at(-1) as
      | { metricSink?: unknown }
      | undefined;
    const liveSessionOptions = liveSessionFactory.mock.calls.at(-1)?.[0];

    expect(dependencies.metricSink).toBeInstanceOf(ConsoleLogMetricSink);
    expect(clientOptions?.metricSink).toBe(dependencies.metricSink);
    expect(liveSessionOptions?.metricSink).toBe(dependencies.metricSink);
  });
});
