import { getFactures } from "@/lib/dispensaire-facturation";
import { getRapportData, getHistoriqueRapports, getRapportConfig } from "@/lib/dispensaire-rapport-impayes";
import { getMedecinsEffectifs } from "@/lib/dispensaire-effectifs";
import { DispensaireFactures } from "@/components/dispensaire-factures";

export const dynamic = "force-dynamic";

export default async function DispensaireFacturesPage() {
  const [data, { rapport }, { rapports }, config, medecins] = await Promise.all([getFactures(), getRapportData(), getHistoriqueRapports(), getRapportConfig(), getMedecinsEffectifs()]);
  return <DispensaireFactures data={data} rapport={rapport} historique={rapports} config={config} medecins={medecins} />;
}
