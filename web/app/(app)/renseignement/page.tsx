import { getRenseignement } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { RenseignementPanel } from "@/components/renseignement-panel";

export const dynamic = "force-dynamic";

export default async function RenseignementPage() {
  const data = await getRenseignement();

  return (
    <>
      <PageHeader titre="Renseignement" sous="Rapports d'informateurs & personnes traquées — modifiables" actif={data.connecte} />
      <RenseignementPanel rapports={data.rapports} traques={data.traques} />
    </>
  );
}
