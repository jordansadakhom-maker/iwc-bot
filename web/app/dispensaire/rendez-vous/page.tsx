import { getRendezVous } from "@/lib/dispensaire-rendez-vous";
import { DispensaireRendezVous } from "@/components/dispensaire-rendez-vous";

export const dynamic = "force-dynamic";

export default async function DispensaireRendezVousPage() {
  const data = await getRendezVous();
  return <DispensaireRendezVous data={data} />;
}
