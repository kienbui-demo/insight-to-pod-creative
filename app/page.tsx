import { buildWarehouseReader } from "../src/integration/warehouse-reader";
import { DiscoverScreen } from "../src/ui/discover/discover-screen";
import { TREND_CARDS } from "../src/ui/mocks/trend-cards";

export default async function Home() {
  const reader = buildWarehouseReader();
  const cards = reader ? await reader.listRecent(24) : [...TREND_CARDS];
  const source = reader ? "live" : "sample";

  return <DiscoverScreen cards={cards} source={source} />;
}
