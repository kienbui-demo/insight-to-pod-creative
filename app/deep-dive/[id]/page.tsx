import { notFound } from "next/navigation";

import { buildWarehouseReader } from "../../../src/integration/warehouse-reader";
import { DeepDiveScreen } from "../../../src/ui/deep-dive/deep-dive-screen";

export default async function DeepDivePage({
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

  return <DeepDiveScreen card={card} />;
}
