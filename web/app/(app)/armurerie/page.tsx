import { getArmurerie } from "@/lib/queries";
import { getMouvementsStock, getDernierScanArmurerie } from "@/app/(app)/armurerie/actions";
import { PageHeader, Card } from "@/components/ui";
import { ArmurerieComptoir } from "@/components/armurerie-comptoir";

// Relance de déploiement (mise en ligne « fabricable » Produits/Caisse).
export const dynamic = "force-dynamic";

export default async function ArmureriePage() {
  const [{ connecte, clients, ventes, contrats, ca, coffre, mouvementsCoffre, produits, employes, pointages, paies, impots, notes, taches, commandes, ressources, rdvs }, mouvementsStock, scan] = await Promise.all([
    getArmurerie(),
    getMouvementsStock(),
    getDernierScanArmurerie(),
  ]);

  return (
    <>
      <PageHeader titre="Armurerie de Van Horn" sous="Gestion complète : caisse, stock, employés, paies, comptabilité, impôts & contrats" actif={connecte} />
      <Card>
        <ArmurerieComptoir clients={clients} ventes={ventes} contrats={contrats} ca={ca} coffre={coffre} mouvementsCoffre={mouvementsCoffre} produits={produits} employes={employes} pointages={pointages} paies={paies} impots={impots} notes={notes} taches={taches} commandes={commandes} ressources={ressources} rdvs={rdvs} mouvementsStock={mouvementsStock} scan={scan} />
      </Card>
    </>
  );
}
