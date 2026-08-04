import { Network, CheckCircle2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { CarteMetierVue } from "@/components/carte-metier-vue";
import { getCarteMetier } from "@/lib/carte-metier-data";

export const dynamic = "force-dynamic";

export default async function CarteMetierPage() {
  const { connecte, carto, membres, peut } = await getCarteMetier();
  const couvertes = carto.metiers.filter((m) => m.couverture === "ok").length;
  const band = [
    { icon: CheckCircle2, label: "Fonctions couvertes", val: `${couvertes}/${carto.metiers.length}`, sous: "assurées" },
    { icon: Network, label: "Fonctions", val: String(carto.metiers.length), sous: "cartographiées" },
    { icon: Users, label: "Membres", val: String(carto.total), sous: "positionnés" },
  ];
  return (
    <>
      <PageHeader
        titre="Carte métier"
        sous={connecte ? `${couvertes}/${carto.metiers.length} fonction(s) couverte(s) · ${carto.total} membre(s)` : "Cartographie des fonctions de la compagnie"}
        actif={connecte}
      />
      {connecte ? (
        <>
          <PlaqueBand items={band} cols={3} />
          <CarteMetierVue carto={carto} membres={membres} peut={peut} />
        </>
      ) : (
        <p className="rounded-card border border-border bg-surface p-8 text-center text-[0.9rem] italic text-faint shadow-card">Connecte-toi avec Discord pour voir la cartographie des métiers.</p>
      )}
    </>
  );
}
