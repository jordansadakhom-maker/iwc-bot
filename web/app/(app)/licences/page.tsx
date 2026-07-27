import { getLicences, getLicenceConfig } from "@/lib/licences";
import { PageHeader, Card } from "@/components/ui";
import { LicencesRegistre } from "@/components/licences";

export const dynamic = "force-dynamic";

export default async function LicencesPage() {
  const [data, config] = await Promise.all([getLicences(), getLicenceConfig()]);
  return (
    <>
      <PageHeader titre="Licences & autorisations" sous="Registre officiel — délivrance, validité, restrictions et vérification rapide" actif={data.pret} />
      <Card><LicencesRegistre data={data} config={config} /></Card>
    </>
  );
}
