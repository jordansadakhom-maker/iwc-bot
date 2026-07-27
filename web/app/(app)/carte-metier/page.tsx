import { PageHeader } from "@/components/ui";
import { CarteMetierVue } from "@/components/carte-metier-vue";
import { getCarteMetier } from "@/lib/carte-metier-data";

export const dynamic = "force-dynamic";

export default async function CarteMetierPage() {
  const { connecte, carto } = await getCarteMetier();
  const couvertes = carto.metiers.filter((m) => m.couverture === "ok").length;
  return (
    <>
      <PageHeader
        titre="Carte métier"
        sous={connecte ? `${couvertes}/${carto.metiers.length} fonction(s) couverte(s) · ${carto.total} membre(s)` : "Cartographie des fonctions de la compagnie"}
        actif={connecte}
      />
      {connecte ? (
        <CarteMetierVue carto={carto} />
      ) : (
        <p className="rounded-card border border-border bg-surface p-8 text-center text-[0.9rem] italic text-faint shadow-card">Connecte-toi avec Discord pour voir la cartographie des métiers.</p>
      )}
    </>
  );
}
