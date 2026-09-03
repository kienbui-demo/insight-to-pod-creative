import { afterEach, describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import * as modelarkLiveSessionModule from "../../agent/modelark-live-session";
import { buildLiveDependencies } from "../live-dependencies";
import { stubSeedreamImagePort } from "../stub-seedream-image-port";

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

    const dependencies = buildLiveDependencies(VALID_ENV);

    expect(dependencies.lookup).toBeDefined();
    expect(dependencies.liveSessions).toBeDefined();
    await expect(dependencies.lookup.lookup(CRAWL)).resolves.toEqual({
      kind: "miss",
    });
    expect(liveSessionFactory).toHaveBeenCalledOnce();
    expect(liveSessionFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        seedream: stubSeedreamImagePort,
        maxImagesPerAction: 1,
      }),
    );

    const options = liveSessionFactory.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    if (options === undefined) {
      throw new Error("live session factory was not called");
    }
    await expect(
      options.seedream.generate({
        prompt: "A retro botanical fox",
        size: "1024x1536",
      }),
    ).resolves.toEqual({
      ok: true,
      url: "https://placehold.co/1024x1536/png",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
