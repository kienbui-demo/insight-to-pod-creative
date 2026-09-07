import { Pool } from "pg";

import type {
  PublishDesignPayload,
  PublishDesignRequest,
  PublishDesignResult,
} from "../../packages/contracts";
import { createPublishService } from "../monetization/publish-service";
import { PostgresPublicationRepository } from "../storage/postgres-publication-repository";
import { DEMO_SELLER_ID } from "./demo-seller";
import { createPostgresQueryExecutor } from "./postgres-query-executor";
import { createStubPrintervalPublisher } from "./stub-printerval-publisher";

interface PublishDependencies {
  publish(request: PublishDesignRequest): Promise<PublishDesignResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseBody(value: unknown): Omit<PublishDesignRequest, "sellerId"> {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.idempotencyKey) ||
    !isRecord(value.design)
  ) {
    throw new Error("Invalid publish request");
  }

  const design = value.design;
  if (
    !isNonEmptyString(design.assetUrl) ||
    !isNonEmptyString(design.title) ||
    !isNonEmptyString(design.market) ||
    !isNonEmptyString(design.productType) ||
    (design.description !== undefined &&
      typeof design.description !== "string") ||
    (design.tags !== undefined &&
      (!Array.isArray(design.tags) ||
        !design.tags.every((tag) => typeof tag === "string")))
  ) {
    throw new Error("Invalid publish request");
  }

  const payload: PublishDesignPayload = {
    assetUrl: design.assetUrl,
    title: design.title,
    market: design.market,
    productType: design.productType,
    ...(design.description === undefined
      ? {}
      : { description: design.description }),
    ...(design.tags === undefined ? {} : { tags: design.tags }),
  };
  return {
    projectId: value.projectId,
    idempotencyKey: value.idempotencyKey,
    design: payload,
  };
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function createPublishPostHandler(
  dependencies: PublishDependencies,
) {
  return async function post(request: Request): Promise<Response> {
    let body: Omit<PublishDesignRequest, "sellerId">;
    try {
      body = parseBody(await request.json());
    } catch {
      return jsonError("Invalid publish request", 400);
    }

    const result = await dependencies.publish({
      sellerId: DEMO_SELLER_ID,
      ...body,
    });
    if (result.ok) {
      return json(result, 200);
    }
    if (result.error.code === "publication_idempotency_conflict") {
      return json(result.error, 409);
    }
    return json(result, result.error.recoverable ? 503 : 422);
  };
}

export function buildPublishDependencies(
  env: NodeJS.ProcessEnv = process.env,
): PublishDependencies {
  const databaseUrl = env.DATABASE_URL;
  if (!isNonEmptyString(databaseUrl)) {
    throw new Error("DATABASE_URL is required for publishing");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new PostgresPublicationRepository(
    createPostgresQueryExecutor(pool),
  );
  const service = createPublishService({
    repository,
    publisher: createStubPrintervalPublisher(),
    credits: {
      async debit() {
        throw new Error("Publishing is unmetered");
      },
    },
    managedAgent: {
      async open() {
        throw new Error("Publishing must not open MA");
      },
    },
  });
  return { publish: service.publish };
}
