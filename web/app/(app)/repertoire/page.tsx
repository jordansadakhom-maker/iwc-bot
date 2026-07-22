import { getDispensaire } from "@/lib/dispensaire";
import { PageHeader, Card } from "@/components/ui";
import { RepertoireContacts } from "@/components/repertoire-contacts";

export const dynamic = "force-dynamic";

export default async function RepertoirePage() {
  const data = await getDispensaire();
  return (
    <>
      <PageHeader titre="Répertoire des contacts" sous="Dispensaire de Saint-Denis — indics, alliés, partenaires, fournisseurs &amp; services" actif={data.connecte} />
      <Card>
        <RepertoireContacts data={data} />
      </Card>
    </>
  );
}
