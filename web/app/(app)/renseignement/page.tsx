import { Eye, ScrollText, Skull, Crosshair } from "lucide-react";
import { getRenseignement, getAcces } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { RenseignementPanel } from "@/components/renseignement-panel";
import { AccesReserve } from "@/components/acces-reserve";

export const dynamic = "force-dynamic";

export default async function RenseignementPage() {
  const acces = await getAcces();
  if (!acces.peutRenseignement) return <AccesReserve titre="Renseignement" detail="Le renseignement est réservé à la Direction et aux officiers de terrain." />;
  const data = await getRenseignement();

  const rapNouveaux = data.rapports.filter((r) => (r.statut || "").toLowerCase() === "nouveau").length;
  const traquesActives = data.traques.filter((t) => (t.statut || "").toLowerCase() === "chasse").length;
  const band = [
    { icon: ScrollText, label: "Rapports", val: String(data.rapports.length), sous: "au dossier" },
    { icon: Eye, label: "Nouveaux", val: String(rapNouveaux), sous: "à traiter" },
    { icon: Skull, label: "Personnes traquées", val: String(data.traques.length), sous: "fichées" },
    { icon: Crosshair, label: "En chasse", val: String(traquesActives), sous: "traque active" },
  ];

  return (
    <>
      <PageHeader titre="Renseignement" sous="Rapports d'informateurs & personnes traquées — confidentiel" actif={data.connecte} />
      {(data.rapports.length + data.traques.length) > 0 ? <PlaqueBand items={band} cols={4} /> : null}
      <RenseignementPanel rapports={data.rapports} traques={data.traques} />
    </>
  );
}
