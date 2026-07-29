import { getMarchesChasse } from "@/lib/marches-chasse";
import { PageHeader, Card } from "@/components/ui";
import { MarchesChasse } from "@/components/marches-chasse";

export const dynamic = "force-dynamic";

export default async function MarchesPage() {
  const data = await getMarchesChasse();
  const actives = data.villes.filter((v) => v.actif).length;
  return (
    <>
      <PageHeader
        titre="Villes & Marchés"
        sous={data.pret ? `${actives} ville(s) active(s) · ${data.ressources.length} ressource(s) — prix de rachat & comparateur` : "Prix de rachat par ville — comparateur Légal / Illégal"}
        actif={data.pret}
      />
      <Card>
        <MarchesChasse data={data} />
      </Card>
    </>
  );
}
