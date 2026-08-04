import { Users, UserPlus, Copy } from "lucide-react";
import { getCandidatures } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { RecrutementPanel } from "@/components/recrutement-panel";

export const dynamic = "force-dynamic";

export default async function RecrutementPage() {
  const { connecte, candidatures } = await getCandidatures();
  const band = [
    { icon: Users, label: "Candidatures", val: String(candidatures.length), sous: "au total" },
    { icon: UserPlus, label: "Nouvelles", val: String(candidatures.filter((c) => (c.statut || "").toLowerCase() === "nouveau").length), sous: "à examiner" },
    { icon: Copy, label: "Doublons", val: String(candidatures.filter((c) => c.doublon).length), sous: "signalés" },
  ];
  return (
    <>
      <PageHeader titre="Recrutement" sous="Bureau d'engagement — candidatures déposées depuis le site (/rejoindre)" actif={connecte} />
      {candidatures.length > 0 ? <PlaqueBand items={band} cols={3} /> : null}
      <Card>
        <RecrutementPanel candidatures={candidatures} />
      </Card>
    </>
  );
}
