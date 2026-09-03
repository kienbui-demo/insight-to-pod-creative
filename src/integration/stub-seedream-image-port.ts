import type { SeedreamImagePort } from "../agent/ports";

// F3: replace with real Seedream image generation through ModelArk.
export const stubSeedreamImagePort: SeedreamImagePort = {
  async generate(input) {
    return {
      ok: true,
      url: `https://placehold.co/${encodeURIComponent(input.size)}/png`,
    };
  },
};
