import { describe, expect, it } from "vitest";

import type { CanonicalRecord } from "../../../../packages/contracts";
import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/reddit-search.dataset.json";
import {
  createRedditSearchEntry,
  REDDIT_SEARCH_ACTOR_SLUG,
} from "../reddit-search";

const FIXED_NOW = "2026-09-04T00:00:00.000Z";
const INPUT: CrawlPortInput = {
  source: "reddit",
  market: "US",
  seed: "leather wallet",
  limit: 25,
};

function postsFrom(record: CanonicalRecord): readonly unknown[] {
  const posts = record.payload.posts;
  expect(Array.isArray(posts)).toBe(true);
  if (!Array.isArray(posts)) {
    throw new Error("expected normalized posts array");
  }
  return posts;
}

describe("createRedditSearchEntry", () => {
  it("builds the exact verified Reddit actor input", () => {
    const entry = createRedditSearchEntry();

    expect(REDDIT_SEARCH_ACTOR_SLUG).toBe("harshmaur/reddit-scraper");
    expect(entry.actorSlug).toBe(REDDIT_SEARCH_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      searchTerms: ["leather wallet"],
      searchPosts: true,
      searchComments: false,
      searchCommunities: false,
      crawlCommentsPerPost: false,
      maxPostsCount: 25,
      searchSort: "relevance",
      searchTime: "year",
      includeNSFW: false,
      aiAnalysis: false,
      fastMode: true,
      startUrls: [],
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    });
    const defaultInput = entry.buildInput({ ...INPUT, limit: undefined });
    expect(defaultInput.maxPostsCount).toBe(25);
    expect(defaultInput.searchTerms).toEqual(["leather wallet"]);
  });

  it("normalizes the real fixture into one aggregated culture record", () => {
    const entry = createRedditSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "reddit",
      market: "US",
      seed: "leather wallet",
      capturedAt: FIXED_NOW,
      signalType: "culture",
      payload: { resultCount: 6 },
    });
    expect(postsFrom(records[0])).toHaveLength(6);
  });

  it("counts distinct communities from the real fixture", () => {
    const entry = createRedditSearchEntry({ now: () => FIXED_NOW });
    const [record] = entry.normalize(fixture, INPUT);

    expect(record.payload.distinctCommunities).toBe(6);
  });

  it("computes aggregate engagement and the normalized value", () => {
    const entry = createRedditSearchEntry({ now: () => FIXED_NOW });
    const [record] = entry.normalize(fixture, INPUT);
    const totalScore = fixture.reduce((sum, post) => sum + post.upVotes, 0);
    const totalComments = fixture.reduce(
      (sum, post) => sum + post.commentsCount,
      0,
    );
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
    const reachScore = clamp01(Math.log10(totalScore + 1) / 4);
    const engagementScore = clamp01(
      totalScore > 0 ? totalComments / totalScore : 0,
    );
    const expectedNormalizedValue = clamp01(
      0.5 * reachScore + 0.5 * engagementScore,
    );

    expect(record.payload.totalScore).toBe(11);
    expect(record.payload.totalComments).toBe(10);
    expect(record.payload.reachScore).toBeCloseTo(reachScore, 12);
    expect(record.payload.engagementScore).toBeCloseTo(engagementScore, 12);
    expect(record.payload.normalizedValue).toBeCloseTo(
      0.5894431103014076,
      12,
    );
    expect(record.payload.normalizedValue).toBeCloseTo(
      expectedNormalizedValue,
      12,
    );
    expect(record.payload.normalizedValue).toBeGreaterThanOrEqual(0);
    expect(record.payload.normalizedValue).toBeLessThanOrEqual(1);
  });

  it("returns zero aggregates for an empty dataset", () => {
    const entry = createRedditSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize([], INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "reddit",
      capturedAt: FIXED_NOW,
      signalType: "culture",
      payload: {
        resultCount: 0,
        totalScore: 0,
        totalComments: 0,
        distinctCommunities: 0,
        reachScore: 0,
        engagementScore: 0,
        normalizedValue: 0,
        posts: [],
      },
    });
  });
});
