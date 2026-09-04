import { afterEach, describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import * as modelarkLiveSessionModule from "../../agent/modelark-live-session";
import { alwaysMissTrendCardLookup } from "../always-miss-trend-card-lookup";
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
    const liveSessionOptions = liveSessionFactory.mock.calls[0]?.[0];
    expect(liveSessionOptions).toEqual(
      expect.objectContaining({
        crawl: expect.objectContaining({ fetch: expect.any(Function) }),
      }),
    );
    const stubModulePath = "../../agent/stub-crawl-port";
    const { stubCrawlPort } = await import(stubModulePath);
    expect(
      (liveSessionOptions as unknown as { crawl: unknown }).crawl,
    ).toBe(stubCrawlPort);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the real Apify crawl port when APIFY_TOKEN is present without network I/O", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const liveSessionFactory = vi.spyOn(
      modelarkLiveSessionModule,
      "createModelArkLiveSessionPort",
    );

    buildLiveDependencies({
      ...VALID_ENV,
      APIFY_TOKEN: "test-apify-token",
    });

    const crawl = liveSessionFactory.mock.calls[0]?.[0].crawl;
    const stubModulePath = "../../agent/stub-crawl-port";
    const { stubCrawlPort } = await import(stubModulePath);
    expect(crawl).not.toBe(stubCrawlPort);
    expect(crawl).toEqual(
      expect.objectContaining({ fetch: expect.any(Function) }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the always-miss lookup when DATABASE_URL is absent", async () => {
    const dependencies = buildLiveDependencies(VALID_ENV);

    expect(dependencies.lookup).toBe(alwaysMissTrendCardLookup);
    await expect(dependencies.lookup.lookup(CRAWL)).resolves.toEqual({
      kind: "miss",
    });
  });

  it("selects a repository-backed lookup when DATABASE_URL is present", () => {
    const dependencies = buildLiveDependencies({
      ...VALID_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      ARK_EMBEDDING_MODEL: "skylark-embedding-vision-251215",
    });

    expect(dependencies.lookup).not.toBe(alwaysMissTrendCardLookup);
  });
});
