"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, Info, ArrowRight, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Archive, History, Check, Clock, RotateCcw, ChevronDown } from "lucide-react";
import type { Notif, Activite } from "@/lib/dispensaire-notifications";
import { ETAT_ACTIFS, ETAT_LABEL, type Etat } from "@/lib/erp-assistant-const";
import { setEtatNotif } from "@/app/dispensaire/assistant/actions";

const TONE: Record<Notif["severite"], string> = { alerte: "var(--oxblood)", attention: "var(--warn)", info: "var(--accent)" };

const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const ACT: Record<Activite["genre"], { icon: typeof ArrowUpRight; tone: string }> = {
  entree: { icon: ArrowUpRight, tone: "var(--good)" },
  sortie: { icon: ArrowDownRight, tone: "var(--oxblood)" },
  deplacement: { icon: ArrowLeftRight, tone: "var(--warn)" },
  coffre: { icon: Archive, tone: "var(--accent)" },
};

const estActive = (n: Notif) => ETAT_ACTIFS.includes(n.etat || "nouveau");

export function DispensaireNotifications({ items, activite = [] }: { items: Notif[]; activite?: Activite[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [voirTraitees, setVoirTraitees] = useState(false);

  // Marque une notification (persisté via l'overlay d'état) puis rafraîchit —
  // le décompte de la pastille se recalcule côté serveur (actives seulement).
  const marquer = (id: string, etat: Etat) => {
    setBusy(id);
    startTransition(async () => {
      await setEtatNotif(id, etat);
      router.refresh();
      setBusy(null);
    });
  };

  const actives = items.filter(estActive);
  const traitees = items.filter((n) => !estActive(n));

  const groupes: { cle: Notif["severite"]; label: string }[] = [
    { cle: "alerte", label: "Alertes" },
    { cle: "attention", label: "À traiter" },
    { cle: "info", label: "Informations" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-accent" /><h2 className="font-display text-[1.15rem]">Notifications</h2><span className="font-num text-[0.85rem] text-faint">{actives.length}</span></div>

      {actives.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
          <Info className="mx-auto h-6 w-6 text-faint" />
          <p className="mt-2 text-[0.9rem] text-muted">Rien à signaler — tout est à jour.</p>
        </div>
      ) : groupes.map((g) => {
        const list = actives.filter((n) => n.severite === g.cle);
        if (!list.length) return null;
        return (
          <section key={g.cle}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em]" style={{ color: TONE[g.cle] }}>
              {g.cle === "info" ? <Info className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {g.label} <span className="font-num">({list.length})</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {list.map((n) => (
                <div key={n.id} className="rounded-[12px] border bg-surface-2" style={{ borderColor: `color-mix(in srgb,${TONE[n.severite]} 35%,var(--border))` }}>
                  <Link href={n.href} className="group flex items-center gap-3 p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb,${TONE[n.severite]} 14%,transparent)` }}><AlertTriangle className="h-4 w-4" style={{ color: TONE[n.severite] }} /></span>
                    <div className="min-w-0 flex-1"><div className="text-[0.7rem] uppercase tracking-[0.04em] text-faint">{n.type}{n.etat === "en_cours" ? " · en cours" : ""}</div><div className="truncate text-[0.86rem]">{n.texte}</div></div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5" />
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 px-3 py-1.5">
                    {n.etat !== "en_cours" && (
                      <ActionBtn onClick={() => marquer(n.id, "en_cours")} disabled={busy === n.id} icon={Clock} tone="var(--warn)">En cours</ActionBtn>
                    )}
                    <ActionBtn onClick={() => marquer(n.id, "resolu")} disabled={busy === n.id} icon={Check} tone="var(--good)">Résolue</ActionBtn>
                    <ActionBtn onClick={() => marquer(n.id, "archive")} disabled={busy === n.id} icon={Archive} tone="var(--muted)">Archiver</ActionBtn>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {/* Notifications traitées (résolues / archivées) — repliées, réouvrables. */}
      {traitees.length ? (
        <section>
          <button type="button" onClick={() => setVoirTraitees((v) => !v)} className="mb-1.5 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em] text-faint transition hover:text-muted">
            <ChevronDown className={`h-3.5 w-3.5 transition ${voirTraitees ? "" : "-rotate-90"}`} /> Traitées <span className="font-num">({traitees.length})</span>
          </button>
          {voirTraitees ? (
            <div className="flex flex-col gap-1.5">
              {traitees.map((n) => (
                <div key={n.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface p-3 opacity-70">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2"><Check className="h-4 w-4 text-faint" /></span>
                  <div className="min-w-0 flex-1"><div className="text-[0.7rem] uppercase tracking-[0.04em] text-faint">{n.type} · {ETAT_LABEL[n.etat || "resolu"]}</div><div className="truncate text-[0.86rem] text-muted">{n.texte}</div></div>
                  <ActionBtn onClick={() => marquer(n.id, "nouveau")} disabled={busy === n.id} icon={RotateCcw} tone="var(--accent)">Rouvrir</ActionBtn>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Activité récente : coffres & stock (objet ±, déplacement, coffre créé/modifié). */}
      {activite.length ? (
        <section>
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em] text-faint"><History className="h-3.5 w-3.5" /> Activité récente <span className="font-num">({activite.length})</span></div>
          <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
            <div className="flex flex-col divide-y divide-border/70">
              {activite.map((a) => {
                const { icon: Icon, tone } = ACT[a.genre];
                return (
                  <Link key={a.id} href={a.href} className="group flex items-center gap-2.5 px-3 py-2 transition hover:bg-surface-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb,${tone} 14%,transparent)` }}><Icon className="h-3.5 w-3.5" style={{ color: tone }} /></span>
                    <span className="min-w-0 flex-1 truncate text-[0.82rem]">{a.texte}</span>
                    <span className="shrink-0 whitespace-nowrap font-num text-[0.7rem] text-faint">{a.par ? `${a.par} · ` : ""}{dtFR(a.at)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// Petit bouton d'action compact réutilisé (avec état « occupé »).
function ActionBtn({ onClick, disabled, icon: Icon, tone, children }: { onClick: () => void; disabled?: boolean; icon: typeof Check; tone: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1 rounded-[8px] border border-border px-2 py-1 text-[0.72rem] font-medium text-muted transition hover:bg-surface disabled:opacity-50" style={{ color: tone }}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}
