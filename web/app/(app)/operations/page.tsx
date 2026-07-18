import { getOperations } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { OperationsBoard } from "@/components/operations-board";
import { ContratsTable } from "@/components/contrats-table";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const data = await getOperations();

  return (
    <>
      <PageHeader titre="Opérations & Contrats" sous="Créer et modifier tes opérations — en direct" actif={data.connecte} pole={data.pole} />

      <Card>
        <OperationsBoard operations={data.operations} />
      </Card>

      <Card>
        <ContratsTable contrats={data.contrats} />
      </Card>
    </>
  );
}
