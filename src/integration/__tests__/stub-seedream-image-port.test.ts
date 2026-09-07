import { afterEach, describe, expect, it, vi } from "vitest";

import { stubSeedreamImagePort } from "../stub-seedream-image-port";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stubSeedreamImagePort", () => {
  it("returns a deterministic placeholder derived from the requested size", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      stubSeedreamImagePort.generate({
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
