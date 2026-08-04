import { UserMinus, CalendarClock, Users } from "lucide-react";
import { getAbsences } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { AbsencesManager } from "@/components/absences-manager";

export const dynamic = "force-dynamic";

export default async function AbsencesPage() {
  const data = await getAbsences();
  const total = data.absents.length + data.programmees.length;
  const band = [
    { icon: UserMinus, label: "Absents", val: String(data.absents.length), sous: "actuellement" },
    { icon: CalendarClock, label: "Programmées", val: String(data.programmees.length), sous: "à venir" },
    { icon: Users, label: "Total au registre", val: String(total), sous: "congés & absences" },
  ];
  return (
    <>
      <PageHeader
        titre="Absences"
        sous={data.connecte ? `Registre des présences — ${data.absents.length} absent(s) · ${data.programmees.length} à venir` : "Reflet du bureau des présences"}
        actif={data.connecte}
      />
      {data.connecte && total > 0 ? <PlaqueBand items={band} cols={3} /> : null}
      <AbsencesManager data={data} />
    </>
  );
}
