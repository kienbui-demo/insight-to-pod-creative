import type { ApifyActorEntry } from "../apify-crawl-port";

export const PINTEREST_SEARCH_ACTOR_SLUG = "bovi/pinterest-scraper";

const REACH_LOG_CEILING = 3;

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

export function createPinterestSearchEntry(options?: {
  now?: () => string;
}): ApifyActorEntry {
  const now = options?.now ?? (() => new Date().toISOString());

  return {
    actorSlug: PINTEREST_SEARCH_ACTOR_SLUG,
    enabled: true,
    buildInput: (input) => ({
      keywords: [input.seed],
      maxItems: input.limit ?? 25,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    }),
    normalize: (items, input) => {
      const pins = items.filter(isPlainObject).map((item) => ({
        id: typeof item.id === "string" ? item.id : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
        description:
          typeof item.description === "string" ? item.description : undefined,
        domain: typeof item.domain === "string" ? item.domain : undefined,
        boardName:
          typeof item.board_name === "string" ? item.board_name : undefined,
        pinnerUsername:
          typeof item.pinner_username === "string"
            ? item.pinner_username
            : undefined,
        repinCount: finiteNumber(item.repin_count),
        createdAt:
          typeof item.created_at === "string" ? item.created_at : undefined,
      }));
      const resultCount = pins.length;
      const distinctDomains = new Set(
        pins
          .map((pin) => pin.domain)
          .filter((domain): domain is string => domain !== undefined),
      ).size;
      const distinctBoards = new Set(
        pins
          .map((pin) => pin.boardName)
          .filter((boardName): boardName is string => boardName !== undefined),
      ).size;
      const totalRepins = pins.reduce(
        (sum, pin) => sum + (pin.repinCount ?? 0),
        0,
      );
      const reachScore = clamp01(
        Math.log10(resultCount + 1) / REACH_LOG_CEILING,
      );
      const engagementScore = clamp01(
        resultCount > 0 ? totalRepins / resultCount : 0,
      );
      const normalizedValue = clamp01(
        0.7 * reachScore + 0.3 * engagementScore,
      );

      return [
        {
          source: "pinterest",
          market: input.market,
          seed: input.seed,
          capturedAt: now(),
          signalType: "culture",
          payload: {
            resultCount,
            distinctDomains,
            distinctBoards,
            totalRepins,
            reachScore,
            engagementScore,
            pins,
            normalizedValue,
          },
        },
      ];
    },
  };
}
