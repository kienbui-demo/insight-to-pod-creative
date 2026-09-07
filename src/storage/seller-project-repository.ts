import type { SellerProject } from "../../packages/contracts";

export interface SellerProjectRepository {
  save(project: SellerProject): Promise<void>;
  findById(id: string): Promise<SellerProject | null>;
}
