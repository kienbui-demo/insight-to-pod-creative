import { buildWarehouseReader } from "../src/integration/warehouse-reader";
import { DiscoverScreen } from "../src/ui/discover/discover-screen";

export default async function Home() {
  const reader = buildWarehouseReader();
  const cards = reader ? await reader.listRecent(24) : [];
  const source = reader ? "live" : "empty";

  return <DiscoverScreen cards={cards} source={source} />;
}
