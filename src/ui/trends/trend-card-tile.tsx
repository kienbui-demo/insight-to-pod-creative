import Link from "next/link";

import type { TrendCard } from "../../../packages/contracts";
import {
  formatConfidence,
  formatCrawlSource,
  formatOpportunityScore,
} from "../formatters";
import { Badge, Panel } from "../components/ui-primitives";

export function TrendCardTile({ card }: { card: TrendCard }) {
  return (
    <Panel className="overflow-hidden">
      {card.referenceImages[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`Reference for ${card.seed}`}
          className="aspect-[16/9] w-full bg-indigo-50 object-cover"
          src={card.referenceImages[0]}
        />
      ) : null}
      <div className="p-5">
        <div className="flex items-center justify-between gap-4">
          <Badge>{card.freshnessTier}</Badge>
          <span className="text-sm font-semibold text-[#4F46E5]">
            {formatOpportunityScore(card.opportunityScore)}
          </span>
        </div>
        <h2 className="mt-4 text-xl font-semibold capitalize text-slate-950">
          {card.seed}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {card.market} · {card.productType} · {formatConfidence(card.confidence)} confidence
        </p>
        {card.missingSources.length > 0 ? (
          <p className="mt-3 text-xs font-medium text-amber-700">
            Missing {card.missingSources.map(formatCrawlSource).join(", ")}
          </p>
        ) : null}
        <Link
          className="mt-5 inline-flex text-sm font-semibold text-[#4F46E5] hover:text-indigo-800"
          href={`/trends/${card.id}`}
        >
          View opportunity →
        </Link>
      </div>
    </Panel>
  );
}
