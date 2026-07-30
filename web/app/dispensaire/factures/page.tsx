import { getFactures } from "@/lib/dispensaire-facturation";
import { getRapportData, getHistoriqueRapports, getRapportConfig } from "@/lib/dispensaire-rapport-impayes";
import { getMedecinsEffectifs } from "@/lib/dispensaire-effectifs";
import { peutFacturer } from "@/lib/dispensaire-roles";
import { DispensaireFactures } from "@/components/dispensaire-factures";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireFacturesPage() {
  if (!(await peutFacturer())) return <AccesDirection sous="Le suivi des factures en retard est réservé à la direction et aux responsables de la facturation." />;
  const [data, { rapport }, { rapports }, config, medecins] = await Promise.all([getFactures(), getRapportData(), getHistoriqueRapports(), getRapportConfig(), getMedecinsEffectifs()]);
  return <DispensaireFactures data={data} rapport={rapport} historique={rapports} config={config} medecins={medecins} />;
}
