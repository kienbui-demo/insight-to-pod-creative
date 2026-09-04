import { describe, expect, it } from "vitest";

import type { CrawlSource } from "../../../../packages/contracts";
import { createApifyActorRegistry } from "../registry";

const CRAWL_SOURCES: readonly CrawlSource[] = [
  "amazon",
  "etsy",
  "google_trends",
  "meta_ads",
  "pinterest",
  "reddit",
  "tiktok",
];

describe("createApifyActorRegistry", () => {
  it("registers all nine enabled actors across every crawl source", () => {
    const registry = createApifyActorRegistry();

    expect(Object.keys(registry).sort()).toEqual(CRAWL_SOURCES);
    expect(registry.amazon).toHaveLength(2);
    expect(registry.etsy).toHaveLength(2);

    for (const source of CRAWL_SOURCES) {
      const entries = registry[source];
      expect(entries).toBeDefined();
      expect(entries).toHaveLength(
        source === "amazon" || source === "etsy" ? 2 : 1,
      );
      for (const entry of entries ?? []) {
        expect(entry.enabled).toBe(true);
        expect(entry.actorSlug).toEqual(expect.any(String));
        expect(entry.actorSlug.length).toBeGreaterThan(0);
      }
    }

    expect(registry.amazon?.[0]?.actorSlug).not.toBe(
      registry.amazon?.[1]?.actorSlug,
    );
    expect(registry.etsy?.[0]?.actorSlug).not.toBe(
      registry.etsy?.[1]?.actorSlug,
    );
  });
});
