import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProvisionalPrintervalPublishRequest } from "../../../packages/contracts";
import { createStubPrintervalPublisher } from "../stub-printerval-publisher";

const REQUEST: ProvisionalPrintervalPublishRequest = {
  projectId: "project-stub",
  idempotencyKey: "publish-stub-key",
  design: {
    assetUrl: "https://assets.example/design.png",
    title: "Retro Halloween Cat",
    market: "US",
    productType: "t-shirt",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createStubPrintervalPublisher", () => {
  it("returns a published result derived from the idempotency key", async () => {
    const publisher = createStubPrintervalPublisher();

    const result = await publisher.publish(REQUEST);

    expect(result).toEqual({
      ok: true,
      publicationId: expect.stringMatching(/^printerval-stub-[a-z0-9]+$/),
      status: "published",
      publishedUrl: expect.stringMatching(
        /^https:\/\/printerval\.example\/stub\/printerval-stub-[a-z0-9]+$/,
      ),
    });
    if (result.ok) {
      expect(result.publishedUrl).toBe(
        `https://printerval.example/stub/${result.publicationId}`,
      );
    }
  });

  it("returns identical provider identifiers for the same idempotency key", async () => {
    const publisher = createStubPrintervalPublisher();

    const first = await publisher.publish(REQUEST);
    const second = await publisher.publish({
      ...REQUEST,
      projectId: "a-different-project-does-not-affect-the-id",
    });

    expect(second).toEqual(first);
  });

  it("returns different publication identifiers for different keys", async () => {
    const publisher = createStubPrintervalPublisher();

    const first = await publisher.publish(REQUEST);
    const second = await publisher.publish({
      ...REQUEST,
      idempotencyKey: "another-publish-key",
    });

    expect(first.ok && first.publicationId).not.toBe(
      second.ok && second.publicationId,
    );
  });

  it("does not read environment variables or call fetch", async () => {
    const originalEnv = process.env;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env = new Proxy(originalEnv, {
      get() {
        throw new Error("Stub publisher must not read process.env");
      },
    });

    try {
      await expect(
        createStubPrintervalPublisher().publish(REQUEST),
      ).resolves.toMatchObject({ ok: true, status: "published" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      process.env = originalEnv;
    }
  });
});
