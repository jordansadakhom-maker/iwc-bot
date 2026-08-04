import { CalendarClock, Send } from "lucide-react";
import { getCommunication, getTelegrammes } from "@/lib/queries";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { RdvManager } from "@/components/rdv-manager";
import { TelegrammesPanel } from "@/components/telegrammes-panel";

export const dynamic = "force-dynamic";

export default async function CommunicationPage() {
  const [{ connecte, rdvs, membres }, tg] = await Promise.all([getCommunication(), getTelegrammes()]);
  const band = [
    { icon: CalendarClock, label: "Rendez-vous clients", val: String(rdvs.length), sous: "planifiés" },
    { icon: Send, label: "Télégrammes", val: String(tg.telegrammes.length), sous: "échangés" },
  ];

  return (
    <>
      <PageHeader titre="Communication" sous="Rendez-vous des clients & télégrammes — avec trace" actif={connecte} />
      {connecte ? <PlaqueBand items={band} cols={2} /> : null}

      <div id="rdv-clients">
        <Card>
          <RdvManager rdvs={rdvs} membres={membres} />
        </Card>
      </div>

      <div id="telegrammes">
        <Card>
          <CardHeader titre="Télégrammes" compteur={tg.telegrammes.length} />
          <TelegrammesPanel telegrammes={tg.telegrammes} />
        </Card>
      </div>
    </>
  );
}
