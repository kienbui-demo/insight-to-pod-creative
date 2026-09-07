import { describe, expect, it } from "vitest";

import type { CanonicalRecord } from "../../../../packages/contracts";
import type { CrawlPortInput } from "../../ports";
import fixture from "../__fixtures__/tiktok-search.dataset.json";
import {
  createTikTokSearchEntry,
  TIKTOK_SEARCH_ACTOR_SLUG,
} from "../tiktok-search";

const FIXED_NOW = "2026-09-04T00:00:00.000Z";
const INPUT: CrawlPortInput = {
  source: "tiktok",
  market: "US",
  seed: "leather wallet",
};

function videosFrom(record: CanonicalRecord): readonly unknown[] {
  const videos = record.payload.videos;
  expect(Array.isArray(videos)).toBe(true);
  if (!Array.isArray(videos)) {
    throw new Error("expected normalized videos array");
  }
  return videos;
}

describe("createTikTokSearchEntry", () => {
  it("builds the exact verified TikTok actor input", () => {
    const entry = createTikTokSearchEntry();

    expect(TIKTOK_SEARCH_ACTOR_SLUG).toBe("clockworks/tiktok-scraper");
    expect(entry.actorSlug).toBe(TIKTOK_SEARCH_ACTOR_SLUG);
    expect(entry.enabled).toBe(true);
    expect(entry.buildInput(INPUT)).toEqual({
      searchQueries: ["leather wallet"],
      resultsPerPage: 100,
      aiVideoDescription: false,
      aiVideoSummary: false,
      commentsPerPost: 0,
      excludePinnedPosts: false,
      maxFollowersPerProfile: 0,
      maxFollowingPerProfile: 0,
      maxRepliesPerComment: 0,
      proxyCountryCode: "None",
      scrapeAdditionalAuthorMeta: false,
      scrapeRelatedSearchWords: false,
      scrapeRelatedVideos: false,
      shouldDownloadAvatars: false,
      shouldDownloadCovers: false,
      shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadVideos: false,
      topLevelCommentsPerPost: 0,
    });
    expect(entry.buildInput({ ...INPUT, limit: 25 }).resultsPerPage).toBe(25);
  });

  it("normalizes the real fixture into one aggregated culture record", () => {
    const entry = createTikTokSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize(fixture, INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "tiktok",
      market: "US",
      seed: "leather wallet",
      capturedAt: FIXED_NOW,
      signalType: "culture",
      payload: { resultCount: 10 },
    });
    expect(videosFrom(records[0])).toHaveLength(10);
  });

  it("derives a normalized value in the unit interval", () => {
    const entry = createTikTokSearchEntry({ now: () => FIXED_NOW });
    const [record] = entry.normalize(fixture, INPUT);
    const totalPlays = fixture.reduce(
      (sum, item) => sum + item.playCount,
      0,
    );
    const totalEngagements = fixture.reduce(
      (sum, item) =>
        sum + item.diggCount + item.shareCount + item.commentCount,
      0,
    );
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
    const reachScore = clamp01(Math.log10(totalPlays + 1) / 7);
    const engagementScore = clamp01(totalEngagements / totalPlays);
    const expectedNormalizedValue = clamp01(
      0.5 * reachScore + 0.5 * engagementScore,
    );

    expect(record.payload.normalizedValue).toBeGreaterThanOrEqual(0);
    expect(record.payload.normalizedValue).toBeLessThanOrEqual(1);
    expect(record.payload.normalizedValue).toBeCloseTo(
      expectedNormalizedValue,
      12,
    );
  });

  it("returns zero aggregates for an empty dataset", () => {
    const entry = createTikTokSearchEntry({ now: () => FIXED_NOW });

    const records = entry.normalize([], INPUT);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "tiktok",
      capturedAt: FIXED_NOW,
      signalType: "culture",
      payload: {
        resultCount: 0,
        totalPlays: 0,
        totalDiggs: 0,
        totalShares: 0,
        totalComments: 0,
        avgPlays: 0,
        avgEngagementRate: 0,
        normalizedValue: 0,
        videos: [],
      },
    });
  });
});
