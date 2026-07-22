import { getHistorique } from "@/lib/dispensaire-historique";
import { DispensaireHistorique } from "@/components/dispensaire-historique";

export const dynamic = "force-dynamic";

export default async function DispensaireHistoriquePage() {
  const data = await getHistorique();
  return <DispensaireHistorique data={data} />;
}
