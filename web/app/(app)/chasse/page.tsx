import { getChasse } from "@/lib/chasse";
import { PageHeader, Card } from "@/components/ui";
import { ChasseModule } from "@/components/chasse-module";

export const dynamic = "force-dynamic";

export default async function ChassePage() {
  const data = await getChasse();

  return (
    <>
      <PageHeader titre="Chasse" sous="Charrettes &amp; ressources de chasse — stock, transferts &amp; import photo" actif={data.connecte} pole={data.pole} />
      <Card>
        <ChasseModule data={data} />
      </Card>
    </>
  );
}
