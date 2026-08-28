import { findTrendCard } from "../../../src/ui/mocks/trend-cards";
import { DesignStudioScreen } from "../../../src/ui/studio/design-studio-screen";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DesignStudioScreen card={findTrendCard(id)} />;
}
