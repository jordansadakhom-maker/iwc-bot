import { getAbsences } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { AbsencesManager } from "@/components/absences-manager";

export const dynamic = "force-dynamic";

export default async function AbsencesPage() {
  const data = await getAbsences();
  const total = data.absents.length + data.programmees.length;
  return (
    <>
      <PageHeader
        titre="Absences"
        sous={data.connecte ? `${data.absents.length} absent(s) · ${data.programmees.length} à venir` : "Reflet du bureau des présences"}
        actif={data.connecte}
      />
      <AbsencesManager data={data} />
    </>
  );
}
