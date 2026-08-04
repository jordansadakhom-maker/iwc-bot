import { Inbox, FolderOpen, UserX, UserCheck } from "lucide-react";
import { getDemandes } from "@/lib/demandes";
import { getSessionDiscordId } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { DemandesBoard } from "@/components/demandes-board";

export const dynamic = "force-dynamic";

export default async function DemandesPage() {
  const monId = await getSessionDiscordId();
  const data = await getDemandes(monId);
  const band = [
    { icon: Inbox, label: "Demandes", val: String(data.stats.total), sous: "au guichet" },
    { icon: FolderOpen, label: "Ouvertes", val: String(data.stats.ouvertes), sous: "en cours" },
    { icon: UserX, label: "Non assignées", val: String(data.stats.nonAssignees), sous: "sans agent" },
    { icon: UserCheck, label: "Mes dossiers", val: String(data.stats.miennes), sous: "qui me sont confiés" },
  ];
  return (
    <>
      <PageHeader titre="Demandes" sous="Le guichet unique de l'IWC — chaque dossier, sa conversation, son suivi." actif={data.pret} />
      {data.pret ? <PlaqueBand items={band} cols={4} /> : null}
      <Card><DemandesBoard data={data} monId={monId} /></Card>
    </>
  );
}
