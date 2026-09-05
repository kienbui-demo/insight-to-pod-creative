import { notFound } from "next/navigation";

import { buildWarehouseReader } from "../../../src/integration/warehouse-reader";
import { DesignStudioScreen } from "../../../src/ui/studio/design-studio-screen";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reader = buildWarehouseReader();
  const card = reader ? await reader.findById(id) : null;
  if (!card) {
    notFound();
  }

  return <DesignStudioScreen card={card} />;
}
