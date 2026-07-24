import { getAssistantDispensaire } from "@/lib/dispensaire-assistant";
import { getKpisDispensaire } from "@/lib/kpi-dispensaire";
import { AssistantPanel } from "@/components/erp-assistant";
import { KpiBand } from "@/components/erp-kpi";
import { RapportPanel } from "@/components/erp-rapport";
import { construireRapport } from "@/lib/erp-rapport-const";
import { setEtatNotif } from "./actions";

export const dynamic = "force-dynamic";

export default async function DispensaireAssistantPage() {
  const [veille, kpis] = await Promise.all([getAssistantDispensaire(), getKpisDispensaire()]);
  const rapport = construireRapport("Bilan du Dispensaire", veille.genereLe, kpis, veille.constats);
  return (
    <div className="flex flex-col gap-3">
      <KpiBand items={kpis} />
      <AssistantPanel data={veille} setEtat={setEtatNotif} />
      <RapportPanel rapport={rapport} />
    </div>
  );
}
