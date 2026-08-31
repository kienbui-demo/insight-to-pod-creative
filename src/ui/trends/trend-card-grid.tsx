import { rankOpportunities } from "../../integration/rank-opportunities";
import type { TrendCard } from "../../../packages/contracts";
import { TrendCardTile } from "./trend-card-tile";

export function TrendCardGrid({ cards }: { cards: readonly TrendCard[] }) {
  const ranked = rankOpportunities(cards);
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {ranked.map((card) => (
        <TrendCardTile card={card} key={card.id} />
      ))}
    </div>
  );
}
