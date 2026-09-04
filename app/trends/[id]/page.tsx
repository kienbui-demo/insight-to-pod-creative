import { notFound } from "next/navigation";

import { buildWarehouseReader } from "../../../src/integration/warehouse-reader";
import { AppShell } from "../../../src/ui/components/app-shell";
import { findTrendCard } from "../../../src/ui/mocks/trend-cards";
import { TrendCardDetail } from "../../../src/ui/trends/trend-card-detail";

export default async function TrendCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reader = buildWarehouseReader();
  const card = reader ? await reader.findById(id) : findTrendCard(id);
  if (!card) {
    notFound();
  }

  return (
    <AppShell>
      <TrendCardDetail card={card} />
    </AppShell>
  );
}
