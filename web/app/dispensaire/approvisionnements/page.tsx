import { getApprovisionnements } from "@/lib/dispensaire-approvisionnements";
import { DispensaireApprovisionnements } from "@/components/dispensaire-approvisionnements";

export const dynamic = "force-dynamic";

export default async function DispensaireApprovisionnementsPage() {
  const data = await getApprovisionnements();
  return <DispensaireApprovisionnements data={data} />;
}
