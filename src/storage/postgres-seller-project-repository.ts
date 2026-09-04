import type { SellerProject } from "../../packages/contracts";
import type { QueryExecutor } from "./postgres-trend-card-repository";
import type { SellerProjectRepository } from "./seller-project-repository";

interface SellerProjectRow {
  id: string;
  seller_id: string;
  market: string;
  seed: string;
  product_type: string | null;
  design_asset_url: string | null;
  design_title: string | null;
  design_description: string | null;
  design_tags: string[] | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class PostgresSellerProjectRepository
  implements SellerProjectRepository
{
  constructor(private readonly executor: QueryExecutor) {}

  async save(project: SellerProject): Promise<void> {
    await this.executor.query(
      `INSERT INTO seller_projects (
         id,
         seller_id,
         market,
         seed,
         product_type,
         design_asset_url,
         design_title,
         design_description,
         design_tags,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9::jsonb,
         now()
       )
       ON CONFLICT (id) DO UPDATE SET
         seller_id = EXCLUDED.seller_id,
         market = EXCLUDED.market,
         seed = EXCLUDED.seed,
         product_type = EXCLUDED.product_type,
         design_asset_url = EXCLUDED.design_asset_url,
         design_title = EXCLUDED.design_title,
         design_description = EXCLUDED.design_description,
         design_tags = EXCLUDED.design_tags,
         updated_at = now()`,
      [
        project.id,
        project.sellerId,
        project.market,
        project.seed,
        project.productType ?? null,
        project.designAssetUrl ?? null,
        project.designTitle ?? null,
        project.designDescription ?? null,
        project.designTags === undefined
          ? null
          : JSON.stringify(project.designTags),
      ],
    );
  }

  async findById(id: string): Promise<SellerProject | null> {
    const result = await this.executor.query<SellerProjectRow>(
      `SELECT
         id,
         seller_id,
         market,
         seed,
         product_type,
         design_asset_url,
         design_title,
         design_description,
         design_tags,
         created_at,
         updated_at
       FROM seller_projects
       WHERE id = $1`,
      [id],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: SellerProjectRow): SellerProject {
    return {
      id: row.id,
      sellerId: row.seller_id,
      market: row.market,
      seed: row.seed,
      productType: row.product_type ?? undefined,
      designAssetUrl: row.design_asset_url ?? undefined,
      designTitle: row.design_title ?? undefined,
      designDescription: row.design_description ?? undefined,
      designTags: row.design_tags ?? undefined,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
  }
}
