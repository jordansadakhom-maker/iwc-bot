"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Package, Bandage, Clock, FileText, Stethoscope, Boxes, Receipt, ShieldCheck, Activity } from "lucide-react";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/dispensaire-premium";
import { jourRelatif, tempsRelatif } from "@/lib/dispensaire-timefmt";

// Timeline temps réel PREMIUM — fil vertical ancré au temps, rail de connexion,
// pastille « live » sur l'événement le plus récent, horodatage relatif qui se
// rafraîchit tout seul. Client-only (temps relatif) → aucun décalage d'hydratation.

export type TimelineItem = { id: string; type: string; texte: string; par?: string | null; at: string };

const META: Record<string, { icon: typeof Package; tone: string }> = {
  stock: { icon: Package, tone: "var(--accent)" },
  vente: { icon: Bandage, tone: "var(--good)" },
  service: { icon: Clock, tone: "var(--steel)" },
  frais: { icon: FileText, tone: "var(--warn)" },
  certificat: { icon: Stethoscope, tone: "var(--accent)" },
  coffre: { icon: Boxes, tone: "var(--accent)" },
  facture: { icon: Receipt, tone: "var(--warn)" },
  fdo: { icon: ShieldCheck, tone: "var(--accent)" },
};
const metaDe = (type: string) => META[type] || { icon: Activity, tone: "var(--accent)" };

export function DispensaireTimeline({ items, titre = "Dernières activités", eyebrow = "Temps réel", actions }: { items: TimelineItem[]; titre?: string; eyebrow?: string; actions?: ReactNode }) {
  // Rafraîchit le temps relatif chaque minute (sans re-fetch) — effet « vivant ».
  // Se met en pause quand l'onglet est masqué (optimisation), et se resynchronise
  // au retour au premier plan.
  const [nowMs, setNowMs] = useState<number>(() => 0);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNowMs(Date.now());
    const demarrer = () => { if (id == null) { tick(); id = setInterval(tick, 60_000); } };
    const arreter = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => (typeof document !== "undefined" && document.hidden ? arreter() : demarrer());
    demarrer();
    document.addEventListener("visibilitychange", onVis);
    return () => { arreter(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return (
    <PremiumCard lift={false} className="p-4">
      <SectionHeader eyebrow={eyebrow} titre={titre} icon={Activity} actions={actions} />
      {items.length === 0 ? (
        <EmptyState icon={Activity} titre="Le registre est encore silencieux" sous="La première écriture s'inscrira ici — soins, stocks, personnel." />
      ) : (
        <ol className="relative flex flex-col">
          {/* Rail vertical de connexion */}
          <span aria-hidden className="pointer-events-none absolute bottom-2 left-[15px] top-2 w-px" style={{ background: "linear-gradient(180deg,color-mix(in srgb,var(--accent) 40%,transparent),color-mix(in srgb,var(--ink) 10%,transparent))" }} />
          {items.map((a, i) => {
            const { icon: Icon, tone } = metaDe(a.type);
            const jour = jourRelatif(a.at);
            const jourPrec = i > 0 ? jourRelatif(items[i - 1].at) : null;
            const nouveauJour = jour !== jourPrec;
            const live = i === 0;
            return (
              <li key={a.id} className="disp-rise relative flex items-start gap-3 pb-3.5 pl-0.5" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <span className="relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border" style={{ background: `color-mix(in srgb,${tone} 12%,var(--surface))`, borderColor: `color-mix(in srgb,${tone} 32%,var(--border))` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: tone }} />
                  {live ? <span className="disp-live-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ background: "var(--good)" }} /> : null}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  {nouveauJour ? <div className="mb-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-faint">{jour}</div> : null}
                  <div className="text-[0.84rem] leading-snug">{a.texte}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.7rem] text-faint">
                    <span className="font-num">{nowMs ? tempsRelatif(a.at, nowMs) : ""}</span>
                    {a.par ? <span>· {a.par}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </PremiumCard>
  );
}
