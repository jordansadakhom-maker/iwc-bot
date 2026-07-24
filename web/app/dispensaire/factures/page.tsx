import { getFactures } from "@/lib/dispensaire-facturation";
import { getRapportData, getHistoriqueRapports } from "@/lib/dispensaire-rapport-impayes";
import { DispensaireFactures } from "@/components/dispensaire-factures";

export const dynamic = "force-dynamic";

export default async function DispensaireFacturesPage() {
  const [data, { rapport }, { rapports }] = await Promise.all([getFactures(), getRapportData(), getHistoriqueRapports()]);
  return <DispensaireFactures data={data} rapport={rapport} historique={rapports} />;
}
