import { DeepDiveScreen } from "../../../src/ui/deep-dive/deep-dive-screen";
import { findTrendCard } from "../../../src/ui/mocks/trend-cards";

export default async function DeepDivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DeepDiveScreen card={findTrendCard(id)} />;
}
