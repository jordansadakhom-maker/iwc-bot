import { ListChecks, CircleDashed, CheckCircle2, Flame, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { TachesBoard } from "@/components/taches-board";
import { estEnRetard } from "@/lib/taches";
import { listerTaches } from "./actions";

export const dynamic = "force-dynamic";

export default async function TachesPage() {
  const { connecte, moiId, taches } = await listerTaches();
  const actives = taches.filter((t) => t.statut !== "faite").length;
  const band = [
    { icon: ListChecks, label: "À faire", val: String(taches.filter((t) => t.statut === "a_faire").length), sous: "en attente" },
    { icon: CircleDashed, label: "En cours", val: String(taches.filter((t) => t.statut === "en_cours").length), sous: "traitées" },
    { icon: CheckCircle2, label: "Faites", val: String(taches.filter((t) => t.statut === "faite").length), sous: "clôturées" },
    { icon: Flame, label: "Prioritaires", val: String(taches.filter((t) => t.statut !== "faite" && (t.priorite === "urgente" || t.priorite === "haute")).length), sous: "urgentes / hautes" },
    { icon: CalendarClock, label: "En retard", val: String(taches.filter((t) => estEnRetard(t)).length), sous: "échéance dépassée" },
  ];
  return (
    <>
      <PageHeader
        titre="Tâches"
        sous={connecte ? `Feuille de service — ${actives} en cours · ${taches.length} au total` : "File de priorités partagée de la compagnie"}
        actif={connecte}
      />
      {taches.length > 0 ? <PlaqueBand items={band} cols={5} /> : null}
      <TachesBoard connecte={connecte} moiId={moiId} taches={taches} />
    </>
  );
}
