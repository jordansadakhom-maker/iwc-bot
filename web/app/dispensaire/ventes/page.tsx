import { getVentes } from "@/lib/dispensaire-facturation";
import { DispensaireVentes } from "@/components/dispensaire-ventes";

export const dynamic = "force-dynamic";

export default async function DispensaireVentesPage() {
  const data = await getVentes();
  return <DispensaireVentes data={data} />;
}
