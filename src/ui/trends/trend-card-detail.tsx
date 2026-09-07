import Link from "next/link";

import type { TrendCard } from "../../../packages/contracts";
import { buildOpportunityReport } from "../../insights/build-opportunity-report";
import { deriveSellerInsights } from "../../insights/derive-seller-insights";
import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import {
  formatCompetitorPrice,
  formatConfidence,
  formatCrawlSource,
  formatDate,
  formatOpportunityScore,
} from "../formatters";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function TrendCardDetail({ card }: { card: TrendCard }) {
  const insights = deriveSellerInsights(card);
  const report = buildOpportunityReport(card, insights);
  const chartPeak = Math.max(...card.trendSeries.map((point) => point.v), 1);
  const verdictLabel = {
    "act-now": "Act now",
    watch: "Watch",
    skip: "Skip",
  }[insights.verdict];
  const reportSections = [
    { heading: "Verdict / TL;DR", lines: [report.verdictTldr] },
    { heading: "Why it is rising", lines: report.whyRising },
    { heading: "Money & competition", lines: report.moneyAndCompetition },
    { heading: "Whitespace / differentiation", lines: report.whitespace },
    { heading: "Recommended action", lines: report.recommendedAction },
    {
      heading: "Confidence & caveats",
      lines: report.confidenceAndCaveats,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge>{card.freshnessTier} opportunity</Badge>
          <h1 className="mt-4 text-4xl font-bold capitalize tracking-tight text-slate-950">
            {card.seed}
          </h1>
          <p className="mt-3 text-slate-600">
            Updated {formatDate(card.updatedAt)} · {card.market} · {card.productType}
          </p>
        </div>
        <Link className={primaryActionClass} href={`/studio/${card.id}`}>
          Open Design Studio
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Panel className="p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Opportunity score</p>
              <p className="mt-1 text-3xl font-bold text-[#4F46E5]">
                {formatOpportunityScore(card.opportunityScore)}
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {formatConfidence(card.confidence)} confidence
            </p>
          </div>
          <div className="mt-8 flex gap-3">
            <div
              aria-label="Trend scale"
              className="flex h-40 flex-col justify-between text-[10px] text-slate-500"
            >
              {[100, 75, 50, 25, 0].map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div
              className="flex h-40 flex-1 items-end gap-3"
              aria-label="Trend series"
            >
              {card.trendSeries.map((point) => {
                const pointDate = formatDate(point.t);

                return (
                  <div
                    aria-label={`Search interest ${point.v} on ${pointDate}`}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2"
                    key={point.t}
                    tabIndex={0}
                  >
                    <div
                      className="pointer-events-none absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1.5 text-xs text-white shadow-lg group-hover:block group-focus-within:block"
                      data-testid="trend-tooltip"
                      role="tooltip"
                    >
                      <span className="block font-semibold">Search interest</span>
                      <span className="block">
                        {point.v} · {pointDate}
                      </span>
                    </div>
                    <div
                      className="w-full rounded-t-lg bg-[#4F46E5]"
                      style={{
                        height: `${Math.max((point.v / chartPeak) * 100, 8)}%`,
                      }}
                    />
                    <span className="text-[10px] text-slate-500">
                      {pointDate}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel className="p-6">
          <h2 className="font-semibold text-slate-950">Data confidence</h2>
          <p className="mt-4 text-sm text-slate-600">
            Available: {card.availableSources.map(formatCrawlSource).join(", ")}
          </p>
          {card.missingSources.length > 0 ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Missing: {card.missingSources.map(formatCrawlSource).join(", ")}
            </p>
          ) : null}
        </Panel>
      </div>

      <Panel className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Seller insight dashboard
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Demand, competition, and evidence at a glance.
            </p>
          </div>
          <Badge>{verdictLabel}</Badge>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <section>
            <h3 className="text-sm font-semibold text-slate-950">
              Demand & momentum
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric
                label="Growth"
                value={
                  insights.demand.growthPct === null
                    ? "Not enough data"
                    : formatConfidence(insights.demand.growthPct / 100)
                }
              />
              <Metric label="Momentum" value={insights.demand.momentum} />
              <Metric
                label="Peak window"
                value={
                  insights.demand.peak === null
                    ? "Not available"
                    : `${insights.demand.peak.v} · ${formatDate(insights.demand.peak.t)}`
                }
              />
              <Metric
                label="Current vs peak"
                value={
                  insights.demand.currentVsPeakPct === null
                    ? "Not available"
                    : formatConfidence(
                        insights.demand.currentVsPeakPct / 100,
                      )
                }
              />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-950">
              Money & competition
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric
                label="Price min / median / max"
                value={
                  insights.competition.priceBand === null
                    ? "Not available"
                    : [
                        insights.competition.priceBand.min,
                        insights.competition.priceBand.median,
                        insights.competition.priceBand.max,
                      ]
                        .map((price) => formatCompetitorPrice(price) ?? "—")
                        .join(" / ")
                }
              />
              <Metric
                label="Active-ad ratio"
                value={
                  insights.competition.activeAdRatio === null
                    ? "Not available"
                    : formatConfidence(insights.competition.activeAdRatio)
                }
              />
              <Metric
                label="Competitors"
                value={
                  insights.competition.competitorCount === 0
                    ? "0 · unknown"
                    : `${insights.competition.competitorCount} · ${insights.competition.saturation}`
                }
              />
              <Metric
                label="Proven intent"
                value={
                  insights.competition.provenIntent
                    ? "Yes · Meta Ads"
                    : "Not established"
                }
              />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-950">Confidence</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric
                label="Source coverage"
                value={formatConfidence(
                  insights.confidence.sourceCoveragePct / 100,
                )}
              />
              <Metric
                label="Freshness"
                value={insights.confidence.freshnessTier}
              />
              <Metric
                label="Confidence"
                value={formatConfidence(
                  insights.confidence.confidencePct / 100,
                )}
              />
              <Metric
                label="Missing sources"
                value={
                  insights.confidence.missingSources.length === 0
                    ? "None"
                    : insights.confidence.missingSources
                        .map(formatCrawlSource)
                        .join(", ")
                }
              />
            </div>
          </section>
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold text-slate-950">
          Opportunity report
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {reportSections.map((section) => (
            <section
              className="rounded-2xl border border-slate-100 p-4"
              key={section.heading}
            >
              <h3 className="font-semibold text-slate-900">
                {section.heading}
              </h3>
              <div className="mt-2 space-y-2">
                {section.lines.map((line) => (
                  <p className="text-sm leading-6 text-slate-600" key={line}>
                    {line}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold text-slate-950">Recommended action</h2>
        <p className="mt-3 font-medium text-slate-900">{card.recommendation.action}</p>
        <p className="mt-2 text-slate-600">{card.recommendation.reasoning}</p>
      </Panel>

      {card.referenceImages.length > 0 ? (
        <Panel className="p-6">
          <h2 className="text-xl font-semibold text-slate-950">Reference images</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {card.referenceImages.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`Reference for ${card.seed}`}
                className="aspect-video w-full rounded-2xl bg-indigo-50 object-cover"
                key={image}
                src={image}
              />
            ))}
          </div>
        </Panel>
      ) : null}

      {card.competitors?.length ? (
        <Panel className="p-6">
          <h2 className="text-xl font-semibold text-slate-950">Competitor snapshot</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {card.competitors.map((competitor) => {
              const price = formatCompetitorPrice(competitor.price);

              return (
                <div className="flex items-center justify-between gap-4 py-3" key={competitor.title}>
                  <div>
                    <p className="font-medium text-slate-900">{competitor.title}</p>
                    <p className="text-xs text-slate-500">
                      {competitor.adActive ? "Active ad" : "No active ad observed"}
                    </p>
                  </div>
                  {price ? (
                    <span className="font-semibold text-slate-700">{price}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
