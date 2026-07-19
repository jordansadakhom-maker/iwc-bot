import { getAvisRecherche } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { WantedWall } from "@/components/wanted-wall";

export const dynamic = "force-dynamic";

export default async function WantedPage() {
  const { connecte, avis } = await getAvisRecherche();

  return (
    <>
      <PageHeader titre="Avis de recherche" sous="Le mur des affiches WANTED de la compagnie" actif={connecte} />
      <Card>
        <WantedWall avis={avis} />
      </Card>
    </>
  );
}
