import { getInventaire } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { Armurerie } from "@/components/armurerie";
import { InventaireStock } from "@/components/inventaire-stock";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const { connecte, armes, stock, mouvements, pole } = await getInventaire();

  return (
    <>
      <PageHeader titre="Armurerie &amp; Inventaire" sous="Registre d'armes croqué à l'encre &amp; coffre commun" actif={connecte} pole={pole} />

      <Card>
        <InventaireStock stock={stock} mouvements={mouvements} />
      </Card>

      <Card>
        <Armurerie armes={armes} />
      </Card>
    </>
  );
}
