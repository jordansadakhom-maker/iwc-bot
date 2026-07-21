import { Map as MapIcon } from "lucide-react";
import { getCarte } from "@/lib/queries";
import { PageHeader, Card, Empty } from "@/components/ui";
import { CarteInteractive } from "@/components/carte-interactive";

// Carte interactive NATIVE : lieux (récoltes, vendeurs, planques, coups…) et
// itinéraires réels de la compagnie, synchronisés depuis le bot. On peut zoomer,
// se déplacer, filtrer par type et cliquer un lieu pour le détail.
// Pour un fond de carte pixel-exact, définir NEXT_PUBLIC_CARTE_IMAGE_URL (l'image
// de la carte RDR2 utilisée sur Discord) — sinon un fond stylisé est affiché.
export const dynamic = "force-dynamic";

export default async function CartePage() {
  const data = await getCarte();
  const imageUrl = process.env.NEXT_PUBLIC_CARTE_IMAGE_URL || null;
  const total = data.points.length + data.routes.length;

  return (
    <>
      <PageHeader
        titre="Carte interactive"
        sous={data.connecte ? `${data.points.length} lieu(x) · ${data.routes.length} itinéraire(s)${data.peutConfidentiel ? " · accès confidentiel" : ""}` : "Lieux & itinéraires de la compagnie"}
        actif={data.connecte}
      />
      {total > 0 ? (
        <CarteInteractive data={data} imageUrl={imageUrl} />
      ) : (
        <Card>
          <Empty icon={MapIcon}>
            {data.connecte
              ? "Aucun lieu sur la carte pour l'instant. Ajoute des lieux et itinéraires depuis le salon carte de Discord : ils apparaîtront ici automatiquement."
              : "La carte se remplira dès que le bot aura synchronisé les lieux (exécute carte.sql côté base, puis redéploie le bot)."}
          </Empty>
        </Card>
      )}
    </>
  );
}
