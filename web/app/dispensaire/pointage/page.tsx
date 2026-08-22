import { getPointage, getAssiduite, getAbsencesRecentes } from "@/lib/dispensaire-pointage";
import { peutGererRH, peutAdministrer } from "@/lib/dispensaire-roles";
import { DispensairePointage } from "@/components/dispensaire-pointage";

export const dynamic = "force-dynamic";

export default async function DispensairePointagePage() {
  const [data, assiduite, { absences }, peutGerer, peutAdmin] = await Promise.all([getPointage(), getAssiduite(), getAbsencesRecentes(), peutGererRH(), peutAdministrer()]);
  return <DispensairePointage data={data} assiduite={assiduite} absences={absences} peutGerer={peutGerer} peutAdmin={peutAdmin} />;
}
