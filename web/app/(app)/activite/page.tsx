import { listerActivite } from "./actions";
import { ActiviteJournal } from "@/components/activite-journal";
import { PageHeader, Card, CardHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ActivitePage() {
  const { connecte, items } = await listerActivite();
  return (
    <>
      <PageHeader titre="Journal d'audit" sous="Qui a fait quoi, et quand — actions sensibles tracées (suppressions, coffre, portefeuilles…)" actif={connecte} />
      <Card>
        <CardHeader titre="Activité" compteur={items.length} />
        <ActiviteJournal initial={items} />
      </Card>
    </>
  );
}
