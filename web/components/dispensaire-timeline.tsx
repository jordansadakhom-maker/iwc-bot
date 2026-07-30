"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Package, Bandage, Clock, FileText, Stethoscope, Boxes, Receipt, ShieldCheck, Activity } from "lucide-react";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/dispensaire-premium";

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

// Horodatage relatif court (« à l'instant », « il y a 5 min », « il y a 2 h »),
// bascule sur date+heure au-delà de 24 h.
function relatif(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; }
}

// Séparateur temporel (Aujourd'hui / Hier / date) pour regrouper le fil.
function jourDe(iso: string): string {
  const d = new Date(iso);
  const key = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  const now = new Date();
  const hier = new Date(now); hier.setDate(hier.getDate() - 1);
  if (key.format(d) === key.format(now)) return "Aujourd'hui";
  if (key.format(d) === key.format(hier)) return "Hier";
  try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "long" }).format(d); } catch { return "Plus tôt"; }
}

export function DispensaireTimeline({ items, titre = "Dernières activités", eyebrow = "Temps réel", actions }: { items: TimelineItem[]; titre?: string; eyebrow?: string; actions?: ReactNode }) {
  // Rafraîchit le temps relatif chaque minute (sans re-fetch) — effet « vivant ».
  const [nowMs, setNowMs] = useState<number>(() => 0);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
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
            const jour = jourDe(a.at);
            const jourPrec = i > 0 ? jourDe(items[i - 1].at) : null;
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
                    <span className="font-num">{nowMs ? relatif(a.at, nowMs) : ""}</span>
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
