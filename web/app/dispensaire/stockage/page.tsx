import { getStock } from "@/lib/dispensaire-stock";
import { getPrevisions } from "@/lib/dispensaire-prevision";
import { DispensaireStockage } from "@/components/dispensaire-stockage";
import { DispensairePrevisions } from "@/components/dispensaire-previsions";

export const dynamic = "force-dynamic";

export default async function DispensaireStockagePage() {
  const [data, previsions] = await Promise.all([getStock(), getPrevisions()]);
  return (
    <div className="flex flex-col gap-4">
      <DispensaireStockage data={data} />
      <DispensairePrevisions data={previsions} />
    </div>
  );
}
