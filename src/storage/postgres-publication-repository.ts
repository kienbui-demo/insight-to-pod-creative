import { randomUUID } from "node:crypto";

import type {
  Publication,
  PublicationError,
  ProvisionalPrintervalPublishResponse,
  PublishDesignRequest,
  PublishDesignResult,
} from "../../packages/contracts";
import type {
  PublicationRepository,
  PublicationReservation,
} from "../monetization/publish-service";
import type { QueryExecutor } from "./postgres-trend-card-repository";

interface PublicationRow {
  id: string;
  seller_id: string;
  project_id: string;
  provider: "printerval";
  idempotency_key: string;
  status: Publication["status"];
  provider_publication_id: string | null;
  published_url: string | null;
  failure_code: PublicationError["code"] | null;
  failure_recoverable: boolean | null;
  failure_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface UpdatedAtRow {
  updated_at: Date | string;
}

const PUBLICATION_COLUMNS = `
  id,
  seller_id,
  project_id,
  provider,
  idempotency_key,
  status,
  provider_publication_id,
  published_url,
  failure_code,
  failure_recoverable,
  failure_message,
  created_at,
  updated_at
`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class PostgresPublicationRepository
  implements PublicationRepository
{
  constructor(private readonly executor: QueryExecutor) {}

  async reserve(
    request: PublishDesignRequest,
  ): Promise<PublicationReservation> {
    const existing = await this.findByKey(
      request.sellerId,
      request.idempotencyKey,
    );
    if (existing) {
      return this.existingReservation(request, existing);
    }

    const inserted = await this.executor.query<PublicationRow>(
      `INSERT INTO publications (
         id,
         seller_id,
         project_id,
         idempotency_key,
         provider,
         status,
         design_asset_url,
         design_title,
         design_description,
         design_tags,
         market,
         product_type
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10::jsonb,
         $11,
         $12
       )
       ON CONFLICT (seller_id, idempotency_key) DO NOTHING
       RETURNING ${PUBLICATION_COLUMNS}`,
      [
        randomUUID(),
        request.sellerId,
        request.projectId,
        request.idempotencyKey,
        "printerval",
        "pending",
        request.design.assetUrl,
        request.design.title,
        request.design.description ?? null,
        request.design.tags === undefined
          ? null
          : JSON.stringify(request.design.tags),
        request.design.market,
        request.design.productType,
      ],
    );
    if (inserted.rows[0]) {
      return { kind: "winner", publication: this.mapRow(inserted.rows[0]) };
    }

    const raced = await this.findByKey(
      request.sellerId,
      request.idempotencyKey,
    );
    if (!raced) {
      throw new Error("Publication reservation was not persisted");
    }
    return this.existingReservation(request, raced);
  }

  async saveProviderResult(
    publication: Publication,
    response: ProvisionalPrintervalPublishResponse,
  ): Promise<PublishDesignResult> {
    if (response.ok) {
      const updated = await this.executor.query<UpdatedAtRow>(
        `UPDATE publications
         SET status = $2,
             provider_publication_id = $3,
             published_url = $4,
             updated_at = now()
         WHERE id = $1
         RETURNING updated_at`,
        [
          publication.id,
          "published",
          response.publicationId,
          response.publishedUrl ?? null,
        ],
      );
      const updatedAt = this.updatedAt(updated.rows[0]);
      return {
        ok: true,
        publication: {
          ...publication,
          status: "published",
          providerPublicationId: response.publicationId,
          publishedUrl: response.publishedUrl,
          updatedAt,
        },
      };
    }

    const updated = await this.executor.query<UpdatedAtRow>(
      `UPDATE publications
       SET status = $2,
           failure_code = $3,
           failure_recoverable = $4,
           failure_message = $5,
           updated_at = now()
       WHERE id = $1
       RETURNING updated_at`,
      [
        publication.id,
        "failed",
        response.error.code,
        response.error.recoverable,
        response.error.message,
      ],
    );
    const updatedAt = this.updatedAt(updated.rows[0]);
    return {
      ok: false,
      publication: { ...publication, status: "failed", updatedAt },
      error: response.error,
    };
  }

  private async findByKey(
    sellerId: string,
    idempotencyKey: string,
  ): Promise<PublicationRow | undefined> {
    const result = await this.executor.query<PublicationRow>(
      `SELECT ${PUBLICATION_COLUMNS}
       FROM publications
       WHERE seller_id = $1 AND idempotency_key = $2`,
      [sellerId, idempotencyKey],
    );
    return result.rows[0];
  }

  private existingReservation(
    request: PublishDesignRequest,
    row: PublicationRow,
  ): PublicationReservation {
    if (row.project_id !== request.projectId) {
      return {
        kind: "conflict",
        error: {
          ok: false,
          error: {
            code: "publication_idempotency_conflict",
            sellerId: request.sellerId,
            idempotencyKey: request.idempotencyKey,
            existingProjectId: row.project_id,
            requestedProjectId: request.projectId,
          },
        },
      };
    }

    const publication = this.mapRow(row);
    if (row.status === "failed") {
      if (
        row.failure_code === null ||
        row.failure_recoverable === null ||
        row.failure_message === null
      ) {
        throw new Error("Stored failed publication is missing failure details");
      }
      return {
        kind: "existing",
        result: {
          ok: false,
          publication: { ...publication, status: "failed" },
          error: {
            code: row.failure_code,
            recoverable: row.failure_recoverable,
            message: row.failure_message,
          },
        },
      };
    }

    return {
      kind: "existing",
      result: {
        ok: true,
        publication:
          row.status === "published"
            ? { ...publication, status: "published" }
            : { ...publication, status: "pending" },
      },
    };
  }

  private updatedAt(row: UpdatedAtRow | undefined): string {
    if (!row) {
      throw new Error("Publication update did not find a reserved row");
    }
    return iso(row.updated_at);
  }

  private mapRow(row: PublicationRow): Publication {
    return {
      id: row.id,
      sellerId: row.seller_id,
      projectId: row.project_id,
      provider: row.provider,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      providerPublicationId: row.provider_publication_id ?? undefined,
      publishedUrl: row.published_url ?? undefined,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }
}
