import { getAvisRecherche, getAcces } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { WantedWall } from "@/components/wanted-wall";
import { AccesReserve } from "@/components/acces-reserve";

export const dynamic = "force-dynamic";

export default async function WantedPage() {
  const acces = await getAcces();
  if (!acces.peutRenseignement) return <AccesReserve titre="Avis de recherche" detail="Les avis de recherche sont réservés à la Direction et aux officiers de terrain." />;
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
