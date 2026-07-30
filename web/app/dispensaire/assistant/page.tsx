import { getAssistantDispensaire } from "@/lib/dispensaire-assistant";
import { getKpisDispensaire } from "@/lib/kpi-dispensaire";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { AssistantPanel } from "@/components/erp-assistant";
import { KpiBand } from "@/components/erp-kpi";
import { RapportPanel } from "@/components/erp-rapport";
import { construireRapport } from "@/lib/erp-rapport-const";
import { AccesDirection } from "@/components/dispensaire-acces-direction";
import { setEtatNotif, executerConstat } from "./actions";

export const dynamic = "force-dynamic";

export default async function DispensaireAssistantPage() {
  if (!(await peutAdministrer())) return <AccesDirection sous="L'assistant de veille est réservé à la direction du dispensaire." />;
  const [veille, kpis] = await Promise.all([getAssistantDispensaire(), getKpisDispensaire()]);
  const rapport = construireRapport("Bilan du Dispensaire", veille.genereLe, kpis, veille.constats);
  return (
    <div className="flex flex-col gap-3">
      <KpiBand items={kpis} />
      <AssistantPanel data={veille} setEtat={setEtatNotif} onAction={executerConstat} />
      <RapportPanel rapport={rapport} />
    </div>
  );
}
