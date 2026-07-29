import { getRapports } from "@/lib/dispensaire-docs";
import { getMedecinsEffectifs } from "@/lib/dispensaire-effectifs";
import { DispensaireRapports } from "@/components/dispensaire-rapports";

export const dynamic = "force-dynamic";

export default async function DispensaireRapportsPage() {
  const [data, medecins] = await Promise.all([getRapports(), getMedecinsEffectifs()]);
  return <DispensaireRapports data={data} medecins={medecins} />;
}
