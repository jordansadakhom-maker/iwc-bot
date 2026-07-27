import { PageHeader } from "@/components/ui";
import { TachesBoard } from "@/components/taches-board";
import { listerTaches } from "./actions";

export const dynamic = "force-dynamic";

export default async function TachesPage() {
  const { connecte, moiId, taches } = await listerTaches();
  const actives = taches.filter((t) => t.statut !== "faite").length;
  return (
    <>
      <PageHeader
        titre="Tâches"
        sous={connecte ? `${actives} tâche(s) en cours · ${taches.length} au total` : "File de priorités partagée de la compagnie"}
        actif={connecte}
      />
      <TachesBoard connecte={connecte} moiId={moiId} taches={taches} />
    </>
  );
}
