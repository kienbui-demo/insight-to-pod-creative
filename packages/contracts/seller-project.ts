export interface SellerProject {
  id: string;
  sellerId: string;
  market: string;
  seed: string;
  productType?: string;
  designAssetUrl?: string;
  designTitle?: string;
  designDescription?: string;
  designTags?: string[];
  createdAt: string;
  updatedAt: string;
}
