import { getChasse } from "@/lib/chasse";
import { getMarchesChasse } from "@/lib/marches-chasse";
import { PageHeader, Card } from "@/components/ui";
import { ChasseTabs } from "@/components/chasse-tabs";

export const dynamic = "force-dynamic";

export default async function ChassePage() {
  const [data, marches] = await Promise.all([getChasse(), getMarchesChasse()]);

  return (
    <>
      <PageHeader titre="Chasse" sous="Charrettes &amp; ressources — stock, prix de rachat &amp; marchés" actif={data.connecte} pole={data.pole} />
      <Card>
        <ChasseTabs stock={data} marches={marches} />
      </Card>
    </>
  );
}
