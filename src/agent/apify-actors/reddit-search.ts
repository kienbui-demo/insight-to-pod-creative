import type { ApifyActorEntry } from "../apify-crawl-port";

export const REDDIT_SEARCH_ACTOR_SLUG = "harshmaur/reddit-scraper";

// 10,000 total upvotes saturates the reach score at 1.0.
const REACH_LOG_CEILING = 4;

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

export function createRedditSearchEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: REDDIT_SEARCH_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      searchTerms: [input.seed],
      searchPosts: true,
      searchComments: false,
      searchCommunities: false,
      crawlCommentsPerPost: false,
      maxPostsCount: input.limit ?? 25,
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
    }),
    normalize: (items, input) => {
      const posts = items.filter(isPlainObject).map((item) => {
        const score = finiteNumber(item.score);

        return {
          id: typeof item.id === "string" ? item.id : undefined,
          title: typeof item.title === "string" ? item.title : undefined,
          body: typeof item.body === "string" ? item.body : undefined,
          communityName:
            typeof item.communityName === "string"
              ? item.communityName
              : undefined,
          subredditSubscribers: finiteNumber(item.subredditSubscribers),
          score,
          upVotes: finiteNumber(item.upVotes) ?? score ?? 0,
          upvoteRatio: finiteNumber(item.upvoteRatio),
          commentsCount: finiteNumber(item.commentsCount),
          createdAt:
            typeof item.createdAt === "string" ? item.createdAt : undefined,
          postUrl:
            typeof item.postUrl === "string" ? item.postUrl : undefined,
          flair: typeof item.flair === "string" ? item.flair : undefined,
          authorName:
            typeof item.authorName === "string" ? item.authorName : undefined,
        };
      });
      const totalScore = posts.reduce(
        (sum, post) => sum + post.upVotes,
        0,
      );
      const totalComments = posts.reduce(
        (sum, post) => sum + (post.commentsCount ?? 0),
        0,
      );
      const communities = posts
        .map((post) => post.communityName)
        .filter((community): community is string => community !== undefined);
      const reachScore = clamp01(
        Math.log10(totalScore + 1) / REACH_LOG_CEILING,
      );
      const engagementScore = clamp01(
        totalScore > 0 ? totalComments / totalScore : 0,
      );
      const normalizedValue = clamp01(
        0.5 * reachScore + 0.5 * engagementScore,
      );

      return [
        {
          source: "reddit",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "culture",
          payload: {
            resultCount: posts.length,
            totalScore,
            totalComments,
            distinctCommunities: new Set(communities).size,
            reachScore,
            engagementScore,
            posts,
            normalizedValue,
          },
        },
      ];
    },
  };
}
