import { MessageSquare } from "lucide-react";
import { getCommunication } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { RdvManager } from "@/components/rdv-manager";

export const dynamic = "force-dynamic";

export default async function CommunicationPage() {
  const { connecte, rdvs } = await getCommunication();

  return (
    <>
      <PageHeader titre="Communication" sous="Rendez-vous des clients & télégrammes — avec trace" actif={connecte} />

      <Card>
        <RdvManager rdvs={rdvs} />
      </Card>

      <Card>
        <CardHeader titre="Télégrammes" />
        <Empty icon={MessageSquare}>
          Les télégrammes reçus sur Discord arriveront ici, avec la possibilité de répondre et de garder une trace. Indique-moi le salon Discord des télégrammes et je le branche.
        </Empty>
      </Card>
    </>
  );
}
