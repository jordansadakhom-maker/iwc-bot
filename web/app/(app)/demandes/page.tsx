import { getDemandes } from "@/lib/demandes";
import { getSessionDiscordId } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { DemandesBoard } from "@/components/demandes-board";

export const dynamic = "force-dynamic";

export default async function DemandesPage() {
  const monId = await getSessionDiscordId();
  const data = await getDemandes(monId);
  return (
    <>
      <PageHeader titre="Demandes" sous="Le guichet unique de l'IWC — chaque dossier, sa conversation, son suivi." actif={data.pret} />
      <Card><DemandesBoard data={data} monId={monId} /></Card>
    </>
  );
}
