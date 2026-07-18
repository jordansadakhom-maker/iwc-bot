import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { AssistantConsole } from "@/components/assistant-console";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return (
    <>
      <PageHeader titre="Assistant" sous="Pilote la compagnie en langage naturel" />
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
    </>
  );
}
