import { Crosshair, Boxes, History } from "lucide-react";
import { getInventaire } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { Armurerie } from "@/components/armurerie";
import { InventaireStock } from "@/components/inventaire-stock";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const { connecte, armes, stock, mouvements, pole } = await getInventaire();
  const band = [
    { icon: Crosshair, label: "Armes", val: String(armes.length), sous: "au registre" },
    { icon: Boxes, label: "Articles en stock", val: String(stock.length), sous: "références" },
    { icon: History, label: "Mouvements", val: String(mouvements.length), sous: "tracés" },
  ];

  return (
    <>
      <PageHeader titre="Armurerie &amp; Inventaire" sous="Registre d'armes croqué à l'encre &amp; coffre commun" actif={connecte} pole={pole} />
      {connecte ? <PlaqueBand items={band} cols={3} /> : null}

      <Card>
        <InventaireStock stock={stock} mouvements={mouvements} />
      </Card>

      <Card>
        <Armurerie armes={armes} />
      </Card>
    </>
  );
}
