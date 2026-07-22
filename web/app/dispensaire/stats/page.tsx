import { getStats } from "@/lib/dispensaire-stats";
import { DispensaireStats } from "@/components/dispensaire-stats";

export const dynamic = "force-dynamic";

export default async function DispensaireStatsPage() {
  const data = await getStats();
  return <DispensaireStats data={data} />;
}
