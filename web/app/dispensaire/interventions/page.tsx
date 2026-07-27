import { getInterventions } from "@/lib/dispensaire-interventions";
import { DispensaireInterventions } from "@/components/dispensaire-interventions";

export const dynamic = "force-dynamic";

export default async function DispensaireInterventionsPage() {
  const data = await getInterventions();
  return <DispensaireInterventions data={data} />;
}
