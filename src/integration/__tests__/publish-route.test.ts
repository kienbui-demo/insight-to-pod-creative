import { describe, expect, it, vi } from "vitest";

import type {
  Publication,
  PublishDesignRequest,
  PublishDesignResult,
} from "../../../packages/contracts";
import { DEMO_SELLER_ID } from "../demo-seller";
import { createPublishPostHandler } from "../publish-route";

const BODY = {
  sellerId: "untrusted-client-seller",
  projectId: "project-route",
  idempotencyKey: "publish-route",
  design: {
    assetUrl: "https://assets.example/design.png",
    title: "Retro Halloween Cat",
    description: "Seasonal cat artwork",
    tags: ["cat", "halloween"],
    market: "US",
    productType: "t-shirt",
  },
};

const PUBLISHED: Publication & { status: "published" } = {
  id: "publication-route",
  sellerId: DEMO_SELLER_ID,
  projectId: BODY.projectId,
  provider: "printerval",
  idempotencyKey: BODY.idempotencyKey,
  status: "published",
  providerPublicationId: "provider-route",
  publishedUrl: "https://printerval.example/stub/provider-route",
  createdAt: "2026-09-04T01:00:00.000Z",
  updatedAt: "2026-09-04T02:00:00.000Z",
};

function publishRequest(body: unknown): Request {
  return new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function failedResult(recoverable: boolean): PublishDesignResult {
  return {
    ok: false,
    publication: { ...PUBLISHED, status: "failed" },
    error: {
      code: recoverable
        ? "printerval_unavailable"
        : "printerval_rejected",
      recoverable,
      message: recoverable ? "Try later" : "Design rejected",
    },
  };
}

describe("createPublishPostHandler", () => {
  it("publishes with the server-owned demo seller and ignores client sellerId", async () => {
    const result: PublishDesignResult = { ok: true, publication: PUBLISHED };
    let receivedRequest: PublishDesignRequest | undefined;
    const publish = vi.fn(async (request: PublishDesignRequest) => {
      receivedRequest = request;
      return result;
    });
    const handler = createPublishPostHandler({ publish });

    const response = await handler(publishRequest(BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(publish).toHaveBeenCalledWith({
      sellerId: DEMO_SELLER_ID,
      projectId: BODY.projectId,
      idempotencyKey: BODY.idempotencyKey,
      design: BODY.design,
    });
    expect(receivedRequest?.sellerId).not.toBe(BODY.sellerId);
  });

  it("returns 409 with the idempotency conflict error", async () => {
    const result: PublishDesignResult = {
      ok: false,
      error: {
        code: "publication_idempotency_conflict",
        sellerId: DEMO_SELLER_ID,
        idempotencyKey: BODY.idempotencyKey,
        existingProjectId: "existing-project",
        requestedProjectId: BODY.projectId,
      },
    };
    const handler = createPublishPostHandler({
      publish: vi.fn(async () => result),
    });

    const response = await handler(publishRequest(BODY));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(result.error);
  });

  it("returns 503 with a recoverable failed publication result", async () => {
    const result = failedResult(true);
    const handler = createPublishPostHandler({
      publish: vi.fn(async () => result),
    });

    const response = await handler(publishRequest(BODY));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("returns 422 with a non-recoverable failed publication result", async () => {
    const result = failedResult(false);
    const handler = createPublishPostHandler({
      publish: vi.fn(async () => result),
    });

    const response = await handler(publishRequest(BODY));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("returns 400 without calling publish when projectId is missing", async () => {
    const publish = vi.fn();
    const handler = createPublishPostHandler({ publish });
    const invalidBody = { ...BODY, projectId: undefined };

    const response = await handler(publishRequest(invalidBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid publish request",
    });
    expect(publish).not.toHaveBeenCalled();
  });
});
