import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { AssistantConsole } from "@/components/assistant-console";
import { RechercheIA } from "@/components/recherche-ia";
import { AssistantPanel } from "@/components/erp-assistant";
import { getAssistantIWC } from "@/lib/assistant-iwc";
import { setEtatNotif } from "./veille-actions";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const veille = await getAssistantIWC();
  return (
    <>
      <PageHeader titre="Assistant" sous="Surveille la compagnie et la pilote en langage naturel" />
      {/* Veille automatique : ce que le système a détecté et propose. */}
      <AssistantPanel data={veille} setEtat={setEtatNotif} />
      <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-3.5" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))" }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}>
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <div className="text-[0.85rem] leading-relaxed">
          <b>Donne un ordre, l&apos;assistant le traduit en actions.</b>
          <span className="text-muted"> Il lit les vraies données (opérations, contrats, coffres, membres, contacts) pour comprendre de qui/quoi tu parles, te montre ce qu&apos;il va faire, et n&apos;exécute qu&apos;après ta confirmation. Rien n&apos;est inventé.</span>
        </div>
      </div>
      <AssistantConsole />
      <RechercheIA />
    </>
  );
}
