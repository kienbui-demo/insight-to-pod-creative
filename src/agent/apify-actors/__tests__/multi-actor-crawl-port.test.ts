import { describe, expect, it, vi } from "vitest";

import type { CanonicalRecord } from "../../../../packages/contracts";
import type { ApifyActorEntry } from "../../apify-crawl-port";
import type { CrawlPortInput } from "../../ports";
import {
  createMultiActorCrawlPort,
  type ApifyActorRegistry,
} from "../multi-actor-crawl-port";

const BASE_URL = "https://api.apify.example.test";
const TOKEN = "test-apify-token";
const INPUT: CrawlPortInput = {
  source: "amazon",
  market: "US",
  seed: "retro halloween shirt",
  productType: "t-shirt",
  limit: 10,
};
const RECORD_A: CanonicalRecord = {
  source: "amazon",
  market: "US",
  seed: "retro halloween shirt",
  capturedAt: "2026-09-04T00:00:00.000Z",
  signalType: "demand",
  payload: { actor: "search" },
};
const RECORD_B: CanonicalRecord = {
  source: "amazon",
  market: "US",
  seed: "retro halloween shirt",
  capturedAt: "2026-09-04T00:00:01.000Z",
  signalType: "competition",
  payload: { actor: "detail" },
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function createEntry(
  actorSlug: string,
  record: CanonicalRecord,
  enabled = true,
): ApifyActorEntry {
  return {
    actorSlug,
    enabled,
    buildInput: vi.fn(() => ({ actorSlug })),
    normalize: vi.fn(() => [record]),
  };
}

function createPort(fetch: FetchLike, registry: ApifyActorRegistry) {
  return createMultiActorCrawlPort({
    token: TOKEN,
    baseUrl: BASE_URL,
    registry,
    fetch,
  });
}

describe("createMultiActorCrawlPort", () => {
  it("runs every enabled actor for a source and merges records in order", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      new Response(JSON.stringify([{ id: "x" }]), { status: 200 }),
    );
    const entryA = createEntry(
      "crawloop/amazon-search-scraper",
      RECORD_A,
    );
    const entryB = createEntry("junglee/Amazon-crawler", RECORD_B);
    const port = createPort(fetchMock, { amazon: [entryA, entryB] });

    await expect(port.fetch(INPUT)).resolves.toEqual({
      ok: true,
      records: [RECORD_A, RECORD_B],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE_URL}/v2/acts/crawloop~amazon-search-scraper/run-sync-get-dataset-items`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${BASE_URL}/v2/acts/junglee~Amazon-crawler/run-sync-get-dataset-items`,
    );
  });

  it("fails fast when the first actor fails and does not call the second", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    const entryA = createEntry(
      "crawloop/amazon-search-scraper",
      RECORD_A,
    );
    const entryB = createEntry("junglee/Amazon-crawler", RECORD_B);
    const port = createPort(fetchMock, { amazon: [entryA, entryB] });

    await expect(port.fetch(INPUT)).resolves.toEqual({
      ok: false,
      recoverable: true,
      message: "Apify actor run failed with status 500.",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(entryB.buildInput).not.toHaveBeenCalled();
    expect(entryB.normalize).not.toHaveBeenCalled();
  });

  it("rejects a source with no enabled actor without calling fetch", async () => {
    const fetchMock = vi.fn<FetchLike>();
    const noEntriesPort = createPort(fetchMock, { amazon: [] });
    const missingSourcePort = createPort(fetchMock, {});
    const disabledPort = createPort(fetchMock, {
      amazon: [
        createEntry("crawloop/amazon-search-scraper", RECORD_A, false),
      ],
    });
    const expectedFailure = {
      ok: false,
      recoverable: false,
      message: "No enabled Apify actor for source amazon.",
    };

    await expect(noEntriesPort.fetch(INPUT)).resolves.toEqual(expectedFailure);
    await expect(missingSourcePort.fetch(INPUT)).resolves.toEqual(
      expectedFailure,
    );
    await expect(disabledPort.fetch(INPUT)).resolves.toEqual(expectedFailure);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
