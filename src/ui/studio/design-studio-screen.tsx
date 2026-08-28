import Link from "next/link";

import type { TrendCard } from "../../../packages/contracts";
import { AppShell } from "../components/app-shell";
import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import { formatOpportunityScore } from "../formatters";

export function DesignStudioScreen({ card }: { card: TrendCard }) {
  return (
    <AppShell>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge>Design Studio</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950">
            Turn “<span className="capitalize">{card.seed}</span>” into a draft.
          </h1>
          <p className="mt-3 text-slate-600">
            Opportunity {formatOpportunityScore(card.opportunityScore)} · Mock workspace
          </p>
        </div>
        <Link className={primaryActionClass} href={`/deep-dive/${card.id}`}>
          Ask a deep-dive question
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <Panel className="p-6">
          <h2 className="text-xl font-semibold text-slate-950">Creative direction</h2>
          <dl className="mt-5 space-y-5 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Concept</dt>
              <dd className="mt-1 text-slate-900">{card.recommendation.action}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Product</dt>
              <dd className="mt-1 capitalize text-slate-900">{card.productType}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Market</dt>
              <dd className="mt-1 text-slate-900">{card.market}</dd>
            </div>
          </dl>
          <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            Generation and refinement controls are connected in Phase C.
          </div>
        </Panel>

        <Panel className="overflow-hidden p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-950">Draft preview</h2>
            <Badge>Mock</Badge>
          </div>
          {card.referenceImages[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`Draft preview for ${card.seed}`}
              className="mt-5 aspect-video w-full rounded-2xl bg-indigo-50 object-cover"
              src={card.referenceImages[0]}
            />
          ) : (
            <div className="mt-5 flex aspect-video items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
              Draft preview pending
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
