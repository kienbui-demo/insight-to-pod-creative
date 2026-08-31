import type {
  CanonicalRecord,
  CrawlRequest,
  CrawlSource,
  MetricSink,
  SourceAdapter,
  TrendCard,
} from "../../packages/contracts";
import type {
  NormalizedOpportunityComponents,
  OpportunityScoringResult,
} from "../scoring/opportunity-score";

export interface WarehouseBuildInput {
  market: string;
  seed: string;
  productType?: string;
  window?: CrawlRequest["window"];
  limit?: number;
  freshnessTier: TrendCard["freshnessTier"];
}

export interface CrawlTransport {
  execute(
    source: CrawlSource,
    providerRequest: unknown,
    request: CrawlRequest,
  ): Promise<unknown>;
}

export interface ComponentReduction {
  components: NormalizedOpportunityComponents;
  contributingSources: CrawlSource[];
}

export interface ComponentReducer {
  reduce(records: readonly CanonicalRecord[]): ComponentReduction;
}

export interface RecommendationContext extends OpportunityScoringResult {
  request: WarehouseBuildInput;
  records: CanonicalRecord[];
  components: NormalizedOpportunityComponents;
  availableSources: CrawlSource[];
  missingSources: CrawlSource[];
}

export interface RecommendationPort {
  recommend(
    context: RecommendationContext,
  ): Promise<TrendCard["recommendation"]>;
}

export interface Clock {
  nowIso(): string;
}

export interface WarehouseLogger {
  sourceFailure(source: CrawlSource, error: unknown): void;
}

export interface WarehouseBuilderDependencies {
  adapters: Readonly<Record<CrawlSource, SourceAdapter>>;
  transport: CrawlTransport;
  reducer: ComponentReducer;
  recommendation: RecommendationPort;
  clock: Clock;
  logger: WarehouseLogger;
  metricSink?: MetricSink;
}
