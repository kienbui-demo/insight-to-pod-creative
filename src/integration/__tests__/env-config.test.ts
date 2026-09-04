import { describe, expect, it } from "vitest";

import { loadApifyConfig, loadModelArkConfig } from "../env-config";

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  ARK_BASE_URL: "https://ark.example.test",
  ARK_API_KEY: "test-api-key",
  ARK_AGENT_ID: "test-agent-id",
  ARK_AGENT_VERSION: "7",
  ARK_ENVIRONMENT_ID: "test-environment-id",
};

describe("loadModelArkConfig", () => {
  it("loads a complete environment and converts the agent version", () => {
    expect(loadModelArkConfig(VALID_ENV)).toEqual({
      baseUrl: "https://ark.example.test",
      apiKey: "test-api-key",
      agentId: "test-agent-id",
      agentVersion: 7,
      environmentId: "test-environment-id",
      seedreamModel: "seedream-5-0-lite-260128",
      embeddingModel: "skylark-embedding-vision-251215",
    });
  });

  it.each([
    "ARK_BASE_URL",
    "ARK_API_KEY",
    "ARK_AGENT_ID",
    "ARK_AGENT_VERSION",
    "ARK_ENVIRONMENT_ID",
  ] as const)("throws an error naming a missing %s", (key) => {
    const env = { ...VALID_ENV };
    delete env[key];

    expect(() => loadModelArkConfig(env)).toThrow(key);
  });

  it.each(["not-a-number", "0", "-1", "1.5"])(
    "rejects invalid ARK_AGENT_VERSION %s",
    (agentVersion) => {
      expect(() =>
        loadModelArkConfig({
          ...VALID_ENV,
          ARK_AGENT_VERSION: agentVersion,
        }),
      ).toThrow("ARK_AGENT_VERSION");
    },
  );
});

describe("loadApifyConfig", () => {
  it("throws when APIFY_TOKEN is missing or empty", () => {
    const missingTokenEnv: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
    };
    const emptyTokenEnv: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      APIFY_TOKEN: "",
    };

    expect(() => loadApifyConfig(missingTokenEnv)).toThrow(
      "Missing required environment variable: APIFY_TOKEN",
    );
    expect(() => loadApifyConfig(emptyTokenEnv)).toThrow(
      "Missing required environment variable: APIFY_TOKEN",
    );
  });

  it("uses the default Apify base URL", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      APIFY_TOKEN: "test-apify-token",
    };

    expect(loadApifyConfig(env)).toEqual({
      token: "test-apify-token",
      baseUrl: "https://api.apify.com",
    });
  });

  it("honors APIFY_BASE_URL override", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      APIFY_TOKEN: "test-apify-token",
      APIFY_BASE_URL: "https://apify.example.test",
    };

    expect(loadApifyConfig(env)).toEqual({
      token: "test-apify-token",
      baseUrl: "https://apify.example.test",
    });
  });
});
