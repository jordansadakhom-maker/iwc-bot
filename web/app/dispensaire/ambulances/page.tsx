import { getAmbulances } from "@/lib/dispensaire-ambulances";
import { DispensaireAmbulances } from "@/components/dispensaire-ambulances";

export const dynamic = "force-dynamic";

export default async function DispensaireAmbulancesPage() {
  const data = await getAmbulances();
  return <DispensaireAmbulances data={data} />;
}
