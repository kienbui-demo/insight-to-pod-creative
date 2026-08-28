import Link from "next/link";

import type { TrendCard } from "../../../packages/contracts";
import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import {
  formatCompetitorPrice,
  formatConfidence,
  formatCrawlSource,
  formatDate,
  formatOpportunityScore,
} from "../formatters";

export function TrendCardDetail({ card }: { card: TrendCard }) {
  const peak = Math.max(...card.trendSeries.map((point) => point.v), 1);

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
          <div className="mt-8 flex h-40 items-end gap-3" aria-label="Trend series">
            {card.trendSeries.map((point) => (
              <div className="flex flex-1 flex-col items-center gap-2" key={point.t}>
                <div
                  className="w-full rounded-t-lg bg-[#4F46E5]"
                  style={{ height: `${Math.max((point.v / peak) * 100, 8)}%` }}
                />
                <span className="text-[10px] text-slate-500">
                  {formatDate(point.t)}
                </span>
              </div>
            ))}
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
