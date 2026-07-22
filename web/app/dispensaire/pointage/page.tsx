import { getPointage } from "@/lib/dispensaire-pointage";
import { DispensairePointage } from "@/components/dispensaire-pointage";

export const dynamic = "force-dynamic";

export default async function DispensairePointagePage() {
  const data = await getPointage();
  return <DispensairePointage data={data} />;
}
