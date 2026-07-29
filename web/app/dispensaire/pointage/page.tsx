import { getPointage, getAssiduite, getAbsencesRecentes } from "@/lib/dispensaire-pointage";
import { peutGererRH } from "@/lib/dispensaire-roles";
import { DispensairePointage } from "@/components/dispensaire-pointage";

export const dynamic = "force-dynamic";

export default async function DispensairePointagePage() {
  const [data, assiduite, { absences }, peutGerer] = await Promise.all([getPointage(), getAssiduite(), getAbsencesRecentes(), peutGererRH()]);
  return <DispensairePointage data={data} assiduite={assiduite} absences={absences} peutGerer={peutGerer} />;
}
