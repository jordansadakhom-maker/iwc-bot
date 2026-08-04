import { redirect } from "next/navigation";
import { Activity, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { getAcces } from "@/lib/queries";
import { getSanteBot } from "@/lib/sante-bot";
import { PageHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { SanteBotVue } from "@/components/sante-bot-vue";

// Données toujours fraîches (on diagnostique l'état en direct de la file).
export const dynamic = "force-dynamic";

export default async function SanteBotPage() {
  // Diagnostic technique → réservé à la Direction (comme le Mode Audit).
  if (!(await getAcces()).direction) redirect("/dashboard");
  const data = await getSanteBot();

  const etatLabel = { ok: "Opérationnel", traitement: "Traitement", arret: "À l'arrêt ?", indispo: "Indisponible" }[data.etat];
  const band = [
    { icon: Activity, label: "État du bot", val: etatLabel, sous: data.dispo ? "file lue à l'instant" : "file non joignable" },
    { icon: Clock, label: "En attente", val: String(data.enAttente), sous: "commandes à appliquer" },
    { icon: CheckCircle2, label: "Appliquées", val: String(data.appliquees), sous: "commandes réussies" },
    { icon: AlertTriangle, label: "Échecs", val: String(data.echecs), sous: "commandes en erreur" },
  ];

  return (
    <>
      <PageHeader titre="Santé du bot" sous="File des commandes site → bot (CommandeWeb) — pour repérer d'un coup d'œil si le bot décroche" />
      <PlaqueBand items={band} cols={4} />
      <div className="mt-4">
        <SanteBotVue data={data} />
      </div>
    </>
  );
}
