import { getCommunication, getTelegrammes } from "@/lib/queries";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { RdvManager } from "@/components/rdv-manager";
import { TelegrammesPanel } from "@/components/telegrammes-panel";

export const dynamic = "force-dynamic";

export default async function CommunicationPage() {
  const [{ connecte, rdvs, membres }, tg] = await Promise.all([getCommunication(), getTelegrammes()]);

  return (
    <>
      <PageHeader titre="Communication" sous="Rendez-vous des clients & télégrammes — avec trace" actif={connecte} />

      <Card>
        <RdvManager rdvs={rdvs} membres={membres} />
      </Card>

      <Card>
        <CardHeader titre="Télégrammes" compteur={tg.telegrammes.length} />
        <TelegrammesPanel telegrammes={tg.telegrammes} />
      </Card>
    </>
  );
}
