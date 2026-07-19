import { getArmurerie } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { ArmurerieComptoir } from "@/components/armurerie-comptoir";

export const dynamic = "force-dynamic";

export default async function ArmureriePage() {
  const { connecte, clients, ventes, contrats, ca, coffre, mouvementsCoffre, produits } = await getArmurerie();

  return (
    <>
      <PageHeader titre="Armurerie de Van Horn" sous="Comptoir : caisse, produits, coffre, clients, ventes & contrats" actif={connecte} />
      <Card>
        <ArmurerieComptoir clients={clients} ventes={ventes} contrats={contrats} ca={ca} coffre={coffre} mouvementsCoffre={mouvementsCoffre} produits={produits} />
      </Card>
    </>
  );
}
