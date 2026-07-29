import { getCertificats } from "@/lib/dispensaire-docs";
import { getMedecinsEffectifs } from "@/lib/dispensaire-effectifs";
import { DispensaireCertificats } from "@/components/dispensaire-certificats";

export const dynamic = "force-dynamic";

export default async function DispensaireCertificatsPage() {
  const [data, medecins] = await Promise.all([getCertificats(), getMedecinsEffectifs()]);
  return <DispensaireCertificats data={data} medecins={medecins} />;
}
