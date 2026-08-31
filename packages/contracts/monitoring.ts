import type { CrawlRequest, CrawlSource } from "./crawl";
import type { CreditAction } from "./monetization";
import type { UiEvent } from "./ui-event";

export type InfrastructureComponent =
  | "modelark"
  | "postgres"
  | "warehouse"
  | "printerval";

export type ModelArkOperation =
  | "session_attach_or_create"
  | "history_read"
  | "event_stream"
  | "send"
  | "interrupt"
  | "submit_tool_result";

export type PostgresOperation =
  | "trend_card_exact_query"
  | "seed_embedding"
  | "trend_card_semantic_query";

export type WarehouseOperation = "ma_recommendation";
export type PrintervalOperation = "publish";
export type InfrastructureOperationOutcome = "success" | "error" | "cancelled";

export type InfrastructureOperationLabels =
  | {
      component: "modelark";
      operation: ModelArkOperation;
      outcome: InfrastructureOperationOutcome;
    }
  | {
      component: "postgres";
      operation: PostgresOperation;
      outcome: InfrastructureOperationOutcome;
    }
  | {
      component: "warehouse";
      operation: WarehouseOperation;
      outcome: InfrastructureOperationOutcome;
    }
  | {
      component: "printerval";
      operation: PrintervalOperation;
      outcome: InfrastructureOperationOutcome;
    };

export type LiveRequestKind = "trend_card" | "generate_design" | "deep_dive";
export type LiveDeliveryPath =
  | "cache_hit"
  | "managed_agent"
  | "credit_rejected"
  | "credit_conflict";
export type LiveRequestOutcome = "success" | "error" | "cancelled";

export interface LiveRequestLabels {
  requestKind: LiveRequestKind;
  deliveryPath: LiveDeliveryPath;
  outcome: LiveRequestOutcome;
}

export type SseStreamOutcome = "done" | "fatal_error" | "cancelled";
export interface SseStreamLabels {
  outcome: SseStreamOutcome;
}

export type MonitoringSseEventType = UiEvent["type"] | "unmapped";
export type SseEventDisposition =
  | "emitted"
  | "deduplicated"
  | "ignored_unmapped";

export interface SseEventLabels {
  eventType: MonitoringSseEventType;
  disposition: SseEventDisposition;
}

export type CrawlMode = CrawlRequest["mode"];
export type CrawlSourceOutcome = "success" | "empty" | "failure" | "incomplete";
export type CrawlStage = "adapt" | "execute" | "normalize" | "final_card";

export interface CrawlSourceRunLabels {
  source: CrawlSource;
  mode: CrawlMode;
  outcome: CrawlSourceOutcome;
  stage: CrawlStage;
}

export interface CrawlSourceDurationLabels {
  source: CrawlSource;
  mode: CrawlMode;
  outcome: CrawlSourceOutcome;
}

export interface CrawlRecordsLabels {
  source: CrawlSource;
  mode: CrawlMode;
}

export type TrendCardBuildOutcome =
  | "complete"
  | "degraded"
  | "zero_evidence"
  | "failure";

export interface TrendCardBuildLabels {
  mode: CrawlMode;
  outcome: TrendCardBuildOutcome;
}

export type MissingSourceReason = "error" | "empty" | "unknown";

export interface TrendCardMissingSourceLabels {
  source: CrawlSource;
  mode: CrawlMode;
  reason: MissingSourceReason;
}

export type CreditDecisionOutcome = "applied" | "rejected" | "conflict";

export interface CreditDecisionLabels {
  action: CreditAction;
  outcome: CreditDecisionOutcome;
}

export interface CreditDebitLabels {
  action: CreditAction;
}

export type CreditRefundReason = "downstream_failure";

export interface CreditRefundLabels {
  action: CreditAction;
  reason: CreditRefundReason;
}

export type MeteredOperationOutcome =
  | "succeeded"
  | "failed_refunded"
  | "replay_not_started";

export interface MeteredOperationLabels {
  action: CreditAction;
  outcome: MeteredOperationOutcome;
}

export interface MetricLabelsByName {
  ptv_infra_operation_total: InfrastructureOperationLabels;
  ptv_infra_operation_duration_ms: InfrastructureOperationLabels;
  ptv_live_request_total: LiveRequestLabels;
  ptv_live_request_dispatch_duration_ms: LiveRequestLabels;
  ptv_sse_stream_total: SseStreamLabels;
  ptv_sse_event_total: SseEventLabels;
  ptv_crawl_source_run_total: CrawlSourceRunLabels;
  ptv_crawl_source_duration_ms: CrawlSourceDurationLabels;
  ptv_crawl_records_total: CrawlRecordsLabels;
  ptv_trend_card_build_total: TrendCardBuildLabels;
  ptv_trend_card_missing_source_total: TrendCardMissingSourceLabels;
  ptv_credit_decision_total: CreditDecisionLabels;
  ptv_credits_debited_total: CreditDebitLabels;
  ptv_credits_refunded_total: CreditRefundLabels;
  ptv_metered_operation_total: MeteredOperationLabels;
}

export type MetricName = keyof MetricLabelsByName;

export type CounterMetricName =
  | "ptv_infra_operation_total"
  | "ptv_live_request_total"
  | "ptv_sse_stream_total"
  | "ptv_sse_event_total"
  | "ptv_crawl_source_run_total"
  | "ptv_crawl_records_total"
  | "ptv_trend_card_build_total"
  | "ptv_trend_card_missing_source_total"
  | "ptv_credit_decision_total"
  | "ptv_credits_debited_total"
  | "ptv_credits_refunded_total"
  | "ptv_metered_operation_total";

export type DistributionMetricName =
  | "ptv_infra_operation_duration_ms"
  | "ptv_live_request_dispatch_duration_ms"
  | "ptv_crawl_source_duration_ms";

interface MetricObservationBase {
  value: number;
  observedAt: string;
  observationId?: string;
}

export type CounterMetricObservation = {
  [Name in CounterMetricName]: MetricObservationBase & {
    name: Name;
    kind: "counter";
    labels: MetricLabelsByName[Name];
  };
}[CounterMetricName];

export type DistributionMetricObservation = {
  [Name in DistributionMetricName]: MetricObservationBase & {
    name: Name;
    kind: "distribution";
    labels: MetricLabelsByName[Name];
  };
}[DistributionMetricName];

export type MetricObservation =
  | CounterMetricObservation
  | DistributionMetricObservation;

export type MonitoringThresholdGroup = "infrastructure" | "crawl" | "cost";
export type MonitoringThresholdStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "insufficient_data";
export type MonitoringThresholdOperator =
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal";

export interface MonitoringThresholdBoundary {
  operator: MonitoringThresholdOperator;
  value: number;
}

export interface MonitoringEvaluationWindow {
  from: string;
  to: string;
}

export interface MonitoringThresholdEvaluation {
  ruleId: string;
  group: MonitoringThresholdGroup;
  status: MonitoringThresholdStatus;
  observedValue: number;
  configuredBoundary: MonitoringThresholdBoundary;
  evaluationWindow: MonitoringEvaluationWindow;
}

/**
 * Metric labels are a bounded aggregation surface. Seller IDs, run IDs, seeds,
 * idempotency keys, URLs, model IDs, error messages, markets, and other
 * high-cardinality identifiers must never be placed in labels.
 *
 * When observationId is present, an implementation must ignore every later
 * observation carrying the same observationId.
 */
export interface MetricSink {
  record(observation: MetricObservation): void;
}
