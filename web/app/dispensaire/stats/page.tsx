import { getStats } from "@/lib/dispensaire-stats";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { DispensaireStats } from "@/components/dispensaire-stats";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireStatsPage() {
  if (!(await peutAdministrer())) return <AccesDirection sous="Les statistiques du dispensaire sont réservées à la direction." />;
  const data = await getStats();
  return <DispensaireStats data={data} />;
}
