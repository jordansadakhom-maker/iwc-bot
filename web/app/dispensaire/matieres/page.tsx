import { getMatieres } from "@/lib/dispensaire-matieres";
import { DispensaireMatieres } from "@/components/dispensaire-matieres";

export const dynamic = "force-dynamic";

export default async function DispensaireMatieresPage() {
  const data = await getMatieres();
  return <DispensaireMatieres data={data} />;
}
