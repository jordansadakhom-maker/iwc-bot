import { getArmurerie } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { ArmurerieComptoir } from "@/components/armurerie-comptoir";

export const dynamic = "force-dynamic";

export default async function ArmureriePage() {
  const { connecte, clients, ventes, contrats, ca, coffre, mouvementsCoffre, produits, employes, pointages, paies, impots, notes, taches } = await getArmurerie();

  return (
    <>
      <PageHeader titre="Armurerie de Van Horn" sous="Gestion complète : caisse, stock, employés, paies, comptabilité, impôts & contrats" actif={connecte} />
      <Card>
        <ArmurerieComptoir clients={clients} ventes={ventes} contrats={contrats} ca={ca} coffre={coffre} mouvementsCoffre={mouvementsCoffre} produits={produits} employes={employes} pointages={pointages} paies={paies} impots={impots} notes={notes} taches={taches} />
      </Card>
    </>
  );
}
