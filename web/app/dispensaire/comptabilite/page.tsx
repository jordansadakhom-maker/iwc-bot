import { getComptabilite } from "@/lib/dispensaire-comptabilite";
import { DispensaireComptabilite } from "@/components/dispensaire-comptabilite";

export const dynamic = "force-dynamic";

export default async function DispensaireComptabilitePage() {
  const data = await getComptabilite();
  return <DispensaireComptabilite data={data} />;
}
