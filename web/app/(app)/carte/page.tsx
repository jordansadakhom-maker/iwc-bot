import { Map as MapIcon } from "lucide-react";
import { getCarte } from "@/lib/queries";
import { PageHeader, Card, Empty } from "@/components/ui";
import { CarteInteractive } from "@/components/carte-interactive";

// Carte interactive : lieux (récoltes, vendeurs, planques, coups…) et itinéraires.
// Deux sources fusionnées — le bot (salon « carte » de Discord) ET les ajouts faits
// directement depuis le site (tables web-native, jamais effacées par le bot).
// On peut zoomer, filtrer, cliquer un lieu, et ajouter/éditer lieux & itinéraires.
// Fond de carte : réglable depuis le site (bouton « Fond de carte ») ou via la
// variable NEXT_PUBLIC_CARTE_IMAGE_URL — sinon un fond stylisé est affiché.
export const dynamic = "force-dynamic";

export default async function CartePage() {
  const data = await getCarte();

  return (
    <>
      <PageHeader
        titre="Carte interactive"
        sous={data.connecte ? `${data.points.length} lieu(x) · ${data.routes.length} itinéraire(s)${data.peutConfidentiel ? " · accès confidentiel" : ""}` : "Lieux & itinéraires de la compagnie"}
        actif={data.connecte}
      />
      {data.connecte ? (
        <CarteInteractive data={data} imageUrl={data.imageUrl} />
      ) : (
        <Card>
          <Empty icon={MapIcon}>
            La carte se remplira dès que la base sera connectée. Lance les migrations
            (carte.sql + carte-web.sql), puis recharge.
          </Empty>
        </Card>
      )}
    </>
  );
}
