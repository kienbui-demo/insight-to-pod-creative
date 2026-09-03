import { afterEach, describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import * as modelarkLiveSessionModule from "../../agent/modelark-live-session";
import { buildLiveDependencies } from "../live-dependencies";
import * as seedreamModule from "../modelark-seedream-image-port";

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  ARK_BASE_URL: "https://ark.example.test",
  ARK_API_KEY: "test-api-key",
  ARK_AGENT_ID: "test-agent-id",
  ARK_AGENT_VERSION: "7",
  ARK_ENVIRONMENT_ID: "test-environment-id",
};

const CRAWL = {
  source: "google_trends",
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  mode: "live",
} satisfies CrawlRequest;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildLiveDependencies", () => {
  it("assembles real MA dependencies with explicit in-memory stubs without network I/O", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const liveSessionFactory = vi.spyOn(
      modelarkLiveSessionModule,
      "createModelArkLiveSessionPort",
    );
    const seedreamFactory = vi.spyOn(
      seedreamModule,
      "createModelArkSeedreamImagePort",
    );

    const dependencies = buildLiveDependencies(VALID_ENV);

    expect(dependencies.lookup).toBeDefined();
    expect(dependencies.liveSessions).toBeDefined();
    await expect(dependencies.lookup.lookup(CRAWL)).resolves.toEqual({
      kind: "miss",
    });
    expect(seedreamFactory).toHaveBeenCalledOnce();
    expect(seedreamFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://ark.example.test",
        apiKey: "test-api-key",
        model: "seedream-5-0-lite-260128",
      }),
    );
    expect(liveSessionFactory).toHaveBeenCalledOnce();
    expect(liveSessionFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        seedream: seedreamFactory.mock.results[0].value,
        maxImagesPerAction: 1,
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
