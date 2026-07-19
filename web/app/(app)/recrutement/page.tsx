import { getCandidatures } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { RecrutementPanel } from "@/components/recrutement-panel";

export const dynamic = "force-dynamic";

export default async function RecrutementPage() {
  const { connecte, candidatures } = await getCandidatures();
  return (
    <>
      <PageHeader titre="Recrutement" sous="Candidatures pour rejoindre la compagnie — déposées depuis le site (/rejoindre)" actif={connecte} />
      <Card>
        <RecrutementPanel candidatures={candidatures} />
      </Card>
    </>
  );
}
