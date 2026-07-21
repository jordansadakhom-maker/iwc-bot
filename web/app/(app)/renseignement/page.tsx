import { getRenseignement, getAcces } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { RenseignementPanel } from "@/components/renseignement-panel";
import { AccesReserve } from "@/components/acces-reserve";

export const dynamic = "force-dynamic";

export default async function RenseignementPage() {
  const acces = await getAcces();
  if (!acces.peutRenseignement) return <AccesReserve titre="Renseignement" detail="Le renseignement est réservé à la Direction et aux officiers de terrain." />;
  const data = await getRenseignement();

  return (
    <>
      <PageHeader titre="Renseignement" sous="Rapports d'informateurs & personnes traquées — modifiables" actif={data.connecte} />
      <RenseignementPanel rapports={data.rapports} traques={data.traques} />
    </>
  );
}
