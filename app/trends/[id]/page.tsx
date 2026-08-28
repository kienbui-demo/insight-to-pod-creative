import { AppShell } from "../../../src/ui/components/app-shell";
import { findTrendCard } from "../../../src/ui/mocks/trend-cards";
import { TrendCardDetail } from "../../../src/ui/trends/trend-card-detail";

export default async function TrendCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <TrendCardDetail card={findTrendCard(id)} />
    </AppShell>
  );
}
