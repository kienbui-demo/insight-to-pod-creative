import { afterEach, describe, expect, it, vi } from "vitest";

import type { CrawlRequest } from "../../../packages/contracts";
import { COMPLETE_TREND_CARD } from "../../agent/__fixtures__/trend-card";
import * as modelarkLiveSessionModule from "../../agent/modelark-live-session";
import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
} from "../../bff/types";
import { PostgresTrendCardRepository } from "../../storage/postgres-trend-card-repository";
import { alwaysMissTrendCardLookup } from "../always-miss-trend-card-lookup";
import { buildLiveDependencies } from "../live-dependencies";
import * as embeddingModule from "../modelark-embedding-port";
import * as rescoringModule from "../rescoring-live-session-port";
import * as seedreamModule from "../modelark-seedream-image-port";
import * as synthesizingModule from "../synthesizing-trend-card-live-session-port";

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

async function collect(events: AsyncIterable<RawMaEvent>) {
  const collected: RawMaEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

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

  it("wraps live sessions for persistence only when DATABASE_URL is present", () => {
    const liveSessionFactory = vi.spyOn(
      modelarkLiveSessionModule,
      "createModelArkLiveSessionPort",
    );

    const withoutDatabase = buildLiveDependencies(VALID_ENV);
    const rawWithoutDatabase = liveSessionFactory.mock.results[0]?.value;

    expect(withoutDatabase.liveSessions).toBe(rawWithoutDatabase);

    const withDatabase = buildLiveDependencies({
      ...VALID_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });
    const rawWithDatabase = liveSessionFactory.mock.results[1]?.value;

    expect(withDatabase.liveSessions).not.toBe(rawWithDatabase);
  });

  it("persists final cards only on the DATABASE_URL-backed live-session path", async () => {
    const events = [
      { id: "card-ready", type: "final_card", card: COMPLETE_TREND_CARD },
    ] satisfies readonly RawMaEvent[];
    const createRun = (): LiveRun => ({
      history: vi.fn(async () => []),
      async *openEvents(): AsyncIterable<RawMaEvent> {
        for (const event of events) {
          yield event;
        }
      },
      send: vi.fn(async () => undefined),
      cancel: vi.fn(),
    });
    const rawLiveSessions: LiveSessionPort = {
      create: vi.fn(async () => createRun()),
    };
    vi.spyOn(
      modelarkLiveSessionModule,
      "createModelArkLiveSessionPort",
    ).mockReturnValue(rawLiveSessions);
    const embed = vi.fn(async () => [0.25, 0.75]);
    vi.spyOn(embeddingModule, "createModelArkEmbeddingProvider").mockReturnValue({
      embed,
    });
    const save = vi
      .spyOn(PostgresTrendCardRepository.prototype, "save")
      .mockResolvedValue(undefined);
    const request = { kind: "trend-card", crawl: CRAWL } satisfies BffRequest;

    const withDatabase = buildLiveDependencies({
      ...VALID_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });
    const persistedRun = await withDatabase.liveSessions.create("run-db");
    await persistedRun.send(request);
    await expect(collect(persistedRun.openEvents())).resolves.toEqual(events);

    expect(embed).toHaveBeenCalledWith(
      COMPLETE_TREND_CARD.seed.trim().toLowerCase(),
    );
    expect(save).toHaveBeenCalledWith(COMPLETE_TREND_CARD, [0.25, 0.75]);

    const withoutDatabase = buildLiveDependencies(VALID_ENV);
    const inMemoryRun = await withoutDatabase.liveSessions.create(
      "run-in-memory",
    );
    await inMemoryRun.send(request);
    await expect(collect(inMemoryRun.openEvents())).resolves.toEqual(events);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("places synthesis inside rescoring only when real crawl and repository capabilities exist", () => {
    const createRun = (): LiveRun => ({
      history: vi.fn(async () => []),
      async *openEvents(): AsyncIterable<RawMaEvent> {},
      send: vi.fn(async () => undefined),
      cancel: vi.fn(),
    });
    const rawLiveSessions: LiveSessionPort = {
      create: vi.fn(async () => createRun()),
    };
    const synthesizedLiveSessions: LiveSessionPort = {
      create: vi.fn(async () => createRun()),
    };
    const rescoredLiveSessions: LiveSessionPort = {
      create: vi.fn(async () => createRun()),
    };
    vi.spyOn(
      modelarkLiveSessionModule,
      "createModelArkLiveSessionPort",
    ).mockReturnValue(rawLiveSessions);
    const synthesizingFactory = vi
      .spyOn(
        synthesizingModule,
        "createSynthesizingTrendCardLiveSessionPort",
      )
      .mockReturnValue(synthesizedLiveSessions);
    const rescoringFactory = vi
      .spyOn(rescoringModule, "createRescoringLiveSessionPort")
      .mockReturnValue(rescoredLiveSessions);

    buildLiveDependencies({
      ...VALID_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      APIFY_TOKEN: "test-apify-token",
    });

    expect(synthesizingFactory).toHaveBeenCalledOnce();
    const synthesizingOptions = synthesizingFactory.mock.calls[0]?.[0];
    expect(synthesizingOptions).toEqual(
      expect.objectContaining({
        inner: rawLiveSessions,
        crawl: expect.objectContaining({ fetch: expect.any(Function) }),
        metricSink: expect.anything(),
      }),
    );
    expect(rescoringFactory).toHaveBeenCalledOnce();
    expect(rescoringFactory).toHaveBeenCalledWith({
      inner: synthesizedLiveSessions,
      crawl: synthesizingOptions?.crawl,
    });

    synthesizingFactory.mockClear();
    rescoringFactory.mockClear();
    buildLiveDependencies({
      ...VALID_ENV,
      APIFY_TOKEN: "test-apify-token",
    });

    expect(synthesizingFactory).not.toHaveBeenCalled();
    expect(rescoringFactory).toHaveBeenCalledOnce();
    expect(rescoringFactory.mock.calls[0]?.[0].inner).toBe(rawLiveSessions);

    synthesizingFactory.mockClear();
    rescoringFactory.mockClear();
    buildLiveDependencies({
      ...VALID_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });

    expect(synthesizingFactory).not.toHaveBeenCalled();
    expect(rescoringFactory).not.toHaveBeenCalled();
  });
});
