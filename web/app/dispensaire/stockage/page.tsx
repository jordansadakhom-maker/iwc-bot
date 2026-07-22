import { getStock } from "@/lib/dispensaire-stock";
import { DispensaireStockage } from "@/components/dispensaire-stockage";

export const dynamic = "force-dynamic";

export default async function DispensaireStockagePage() {
  const data = await getStock();
  return <DispensaireStockage data={data} />;
}
