import type { ApifyActorEntry } from "../apify-crawl-port";

export const TIKTOK_SEARCH_ACTOR_SLUG = "clockworks/tiktok-scraper";

// Reach saturates at 10,000,000 plays because log10(10,000,000) is 7.
const REACH_LOG_CEILING = 7;
// Reach contributes half of the normalized culture signal.
const REACH_WEIGHT = 0.5;
// Engagement contributes half of the normalized culture signal.
const ENGAGEMENT_WEIGHT = 0.5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function createTikTokSearchEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: TIKTOK_SEARCH_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      searchQueries: [input.seed],
      resultsPerPage: input.limit ?? 100,
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
    }),
    normalize: (items, input) => {
      const videos = items.filter(isPlainObject).map((item) => {
        const authorMeta = isPlainObject(item.authorMeta)
          ? item.authorMeta
          : {};
        const videoMeta = isPlainObject(item.videoMeta)
          ? item.videoMeta
          : {};
        const hashtags = Array.isArray(item.hashtags)
          ? item.hashtags
              .filter(isPlainObject)
              .map((hashtag) =>
                typeof hashtag.name === "string" && hashtag.name.length > 0
                  ? hashtag.name
                  : undefined,
              )
              .filter((hashtag): hashtag is string => hashtag !== undefined)
          : [];

        return {
          id: typeof item.id === "string" ? item.id : undefined,
          text: typeof item.text === "string" ? item.text : undefined,
          textLanguage:
            typeof item.textLanguage === "string"
              ? item.textLanguage
              : undefined,
          createTimeISO:
            typeof item.createTimeISO === "string"
              ? item.createTimeISO
              : undefined,
          durationSec: finiteNumber(videoMeta.duration),
          author: {
            name:
              typeof authorMeta.name === "string"
                ? authorMeta.name
                : undefined,
            nickName:
              typeof authorMeta.nickName === "string"
                ? authorMeta.nickName
                : undefined,
            verified: authorMeta.verified === true,
            fans: finiteNumber(authorMeta.fans),
          },
          playCount: finiteNumber(item.playCount),
          diggCount: finiteNumber(item.diggCount),
          shareCount: finiteNumber(item.shareCount),
          commentCount: finiteNumber(item.commentCount),
          collectCount: finiteNumber(item.collectCount),
          hashtags,
          url:
            typeof item.webVideoUrl === "string"
              ? item.webVideoUrl
              : undefined,
        };
      });
      const totalPlays = videos.reduce(
        (sum, video) => sum + (video.playCount ?? 0),
        0,
      );
      const totalDiggs = videos.reduce(
        (sum, video) => sum + (video.diggCount ?? 0),
        0,
      );
      const totalShares = videos.reduce(
        (sum, video) => sum + (video.shareCount ?? 0),
        0,
      );
      const totalComments = videos.reduce(
        (sum, video) => sum + (video.commentCount ?? 0),
        0,
      );
      const totalEngagements = totalDiggs + totalShares + totalComments;
      const reachScore = clamp01(
        Math.log10(totalPlays + 1) / REACH_LOG_CEILING,
      );
      const engagementScore = clamp01(
        totalPlays > 0 ? totalEngagements / totalPlays : 0,
      );
      const normalizedValue = clamp01(
        REACH_WEIGHT * reachScore + ENGAGEMENT_WEIGHT * engagementScore,
      );

      return [
        {
          source: "tiktok",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "culture",
          payload: {
            resultCount: videos.length,
            totalPlays,
            totalDiggs,
            totalShares,
            totalComments,
            avgPlays: videos.length > 0 ? totalPlays / videos.length : 0,
            avgEngagementRate:
              totalPlays > 0 ? totalEngagements / totalPlays : 0,
            videos,
            normalizedValue,
          },
        },
      ];
    },
  };
}
