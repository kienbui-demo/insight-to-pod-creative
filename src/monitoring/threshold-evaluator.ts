import type {
  CreditAction,
  CrawlMode,
  CrawlSource,
  InfrastructureOperationLabels,
  MeteredOperationOutcome,
  MonitoringEvaluationWindow,
  MonitoringThresholdBoundary,
  MonitoringThresholdEvaluation,
  MonitoringThresholdStatus,
  TrendCardBuildOutcome,
} from "../../packages/contracts";
import type { MetricSnapshot } from "./in-memory-metric-sink";

export interface MonitoringThresholdPolicy {
  evaluationWindow: MonitoringEvaluationWindow;
  minimumSamples: {
    infrastructure: number;
    crawl: number;
    cost: number;
  };
  infrastructureFailureRate: {
    warningAtOrAbove: number;
    criticalAtOrAbove: number;
  };
  crawlSuccessRate: {
    warningBelow: number;
    criticalBelow: number;
  };
  degradedCardRate: {
    warningAbove: number;
    criticalAbove: number;
  };
  refundRate: {
    warningAbove: number;
    criticalAbove: number;
  };
}

interface InfrastructureAggregate {
  component: InfrastructureOperationLabels["component"];
  operation: InfrastructureOperationLabels["operation"];
  failures: number;
  total: number;
}

interface CrawlAggregate {
  source: CrawlSource;
  mode: CrawlMode;
  successes: number;
  failures: number;
  total: number;
}

interface BuildAggregate {
  mode: CrawlMode;
  outcomes: Record<TrendCardBuildOutcome, number>;
  total: number;
}

interface CostAggregate {
  action: CreditAction;
  outcomes: Record<MeteredOperationOutcome, number>;
  total: number;
}

function inEvaluationWindow(
  observedAt: string,
  window: MonitoringEvaluationWindow,
): boolean {
  const observed = Date.parse(observedAt);
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  return (
    Number.isFinite(observed) &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    observed >= from &&
    observed <= to
  );
}

function boundary(
  operator: MonitoringThresholdBoundary["operator"],
  value: number,
): MonitoringThresholdBoundary {
  return { operator, value };
}

function evaluation(
  ruleId: string,
  group: MonitoringThresholdEvaluation["group"],
  status: MonitoringThresholdStatus,
  observedValue: number,
  configuredBoundary: MonitoringThresholdBoundary,
  evaluationWindow: MonitoringEvaluationWindow,
): MonitoringThresholdEvaluation {
  return {
    ruleId,
    group,
    status,
    observedValue,
    configuredBoundary,
    evaluationWindow,
  };
}

function statusAtOrAbove(
  observed: number,
  warning: number,
  critical: number,
): MonitoringThresholdStatus {
  if (observed >= critical) return "critical";
  if (observed >= warning) return "warning";
  return "healthy";
}

function statusAbove(
  observed: number,
  warning: number,
  critical: number,
): MonitoringThresholdStatus {
  if (observed > critical) return "critical";
  if (observed > warning) return "warning";
  return "healthy";
}

function statusBelow(
  observed: number,
  warning: number,
  critical: number,
): MonitoringThresholdStatus {
  if (observed < critical) return "critical";
  if (observed < warning) return "warning";
  return "healthy";
}

function selectedBoundary(
  status: MonitoringThresholdStatus,
  operator: MonitoringThresholdBoundary["operator"],
  warning: number,
  critical: number,
): MonitoringThresholdBoundary {
  return boundary(operator, status === "critical" ? critical : warning);
}

function escalate(status: MonitoringThresholdStatus): MonitoringThresholdStatus {
  if (status === "healthy") return "warning";
  if (status === "warning") return "critical";
  return status;
}

export function evaluateMonitoringThresholds(
  snapshot: MetricSnapshot,
  policy: MonitoringThresholdPolicy,
): MonitoringThresholdEvaluation[] {
  const infrastructure = new Map<string, InfrastructureAggregate>();
  const crawls = new Map<string, CrawlAggregate>();
  const builds = new Map<CrawlMode, BuildAggregate>();
  const costs = new Map<CreditAction, CostAggregate>();

  for (const observation of snapshot.observations) {
    if (
      observation.kind !== "counter" ||
      !inEvaluationWindow(observation.observedAt, policy.evaluationWindow)
    ) {
      continue;
    }

    switch (observation.name) {
      case "ptv_infra_operation_total": {
        const { component, operation, outcome } = observation.labels;
        const key = `${component}:${operation}`;
        const aggregate = infrastructure.get(key) ?? {
          component,
          operation,
          failures: 0,
          total: 0,
        };
        aggregate.total += observation.value;
        if (outcome === "error") aggregate.failures += observation.value;
        infrastructure.set(key, aggregate);
        break;
      }
      case "ptv_crawl_source_run_total": {
        const { source, mode, outcome } = observation.labels;
        const key = `${source}:${mode}`;
        const aggregate = crawls.get(key) ?? {
          source,
          mode,
          successes: 0,
          failures: 0,
          total: 0,
        };
        aggregate.total += observation.value;
        if (outcome === "success") aggregate.successes += observation.value;
        if (outcome === "failure") aggregate.failures += observation.value;
        crawls.set(key, aggregate);
        break;
      }
      case "ptv_trend_card_build_total": {
        const { mode, outcome } = observation.labels;
        const aggregate = builds.get(mode) ?? {
          mode,
          outcomes: {
            complete: 0,
            degraded: 0,
            zero_evidence: 0,
            failure: 0,
          },
          total: 0,
        };
        aggregate.outcomes[outcome] += observation.value;
        aggregate.total += observation.value;
        builds.set(mode, aggregate);
        break;
      }
      case "ptv_metered_operation_total": {
        const { action, outcome } = observation.labels;
        const aggregate = costs.get(action) ?? {
          action,
          outcomes: {
            succeeded: 0,
            failed_refunded: 0,
            replay_not_started: 0,
          },
          total: 0,
        };
        aggregate.outcomes[outcome] += observation.value;
        aggregate.total += observation.value;
        costs.set(action, aggregate);
        break;
      }
    }
  }

  const results: MonitoringThresholdEvaluation[] = [];

  for (const aggregate of infrastructure.values()) {
    const observed =
      aggregate.total === 0 ? 0 : aggregate.failures / aggregate.total;
    const thresholds = policy.infrastructureFailureRate;
    const status =
      aggregate.total < policy.minimumSamples.infrastructure
        ? "insufficient_data"
        : statusAtOrAbove(
            observed,
            thresholds.warningAtOrAbove,
            thresholds.criticalAtOrAbove,
          );
    results.push(
      evaluation(
        `infrastructure.failure_rate:${aggregate.component}:${aggregate.operation}`,
        "infrastructure",
        status,
        observed,
        selectedBoundary(
          status,
          "greater_than_or_equal",
          thresholds.warningAtOrAbove,
          thresholds.criticalAtOrAbove,
        ),
        policy.evaluationWindow,
      ),
    );
  }

  for (const aggregate of crawls.values()) {
    const observed =
      aggregate.total === 0 ? 0 : aggregate.successes / aggregate.total;
    const thresholds = policy.crawlSuccessRate;
    let status: MonitoringThresholdStatus =
      aggregate.total < policy.minimumSamples.crawl
        ? "insufficient_data"
        : statusBelow(
            observed,
            thresholds.warningBelow,
            thresholds.criticalBelow,
          );

    if (status !== "insufficient_data" && aggregate.source === "meta_ads") {
      status = escalate(status);
    } else if (
      status === "healthy" &&
      aggregate.source === "tiktok" &&
      aggregate.failures > 0
    ) {
      status = "warning";
    }

    results.push(
      evaluation(
        `crawl.success_rate:${aggregate.source}:${aggregate.mode}`,
        "crawl",
        status,
        observed,
        selectedBoundary(
          status,
          "less_than",
          thresholds.warningBelow,
          thresholds.criticalBelow,
        ),
        policy.evaluationWindow,
      ),
    );
  }

  for (const aggregate of builds.values()) {
    const degraded =
      aggregate.total === 0
        ? 0
        : aggregate.outcomes.degraded / aggregate.total;
    const thresholds = policy.degradedCardRate;
    const degradedStatus =
      aggregate.total < policy.minimumSamples.crawl
        ? "insufficient_data"
        : statusAbove(
            degraded,
            thresholds.warningAbove,
            thresholds.criticalAbove,
          );
    results.push(
      evaluation(
        `crawl.degraded_card_rate:${aggregate.mode}`,
        "crawl",
        degradedStatus,
        degraded,
        selectedBoundary(
          degradedStatus,
          "greater_than",
          thresholds.warningAbove,
          thresholds.criticalAbove,
        ),
        policy.evaluationWindow,
      ),
    );

    const zeroEvidence = aggregate.outcomes.zero_evidence;
    results.push(
      evaluation(
        `crawl.zero_evidence:${aggregate.mode}`,
        "crawl",
        zeroEvidence > 0 ? "critical" : "healthy",
        zeroEvidence,
        boundary("greater_than", 0),
        policy.evaluationWindow,
      ),
    );
  }

  for (const aggregate of costs.values()) {
    const observed =
      aggregate.total === 0
        ? 0
        : aggregate.outcomes.failed_refunded / aggregate.total;
    const thresholds = policy.refundRate;
    const status =
      aggregate.total < policy.minimumSamples.cost
        ? "insufficient_data"
        : statusAbove(
            observed,
            thresholds.warningAbove,
            thresholds.criticalAbove,
          );
    results.push(
      evaluation(
        `cost.refund_rate:${aggregate.action}`,
        "cost",
        status,
        observed,
        selectedBoundary(
          status,
          "greater_than",
          thresholds.warningAbove,
          thresholds.criticalAbove,
        ),
        policy.evaluationWindow,
      ),
    );
  }

  return results.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}
