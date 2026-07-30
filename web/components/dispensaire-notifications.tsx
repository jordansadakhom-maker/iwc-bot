"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, Info, ArrowRight, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Archive, History, Check, Clock, RotateCcw, ChevronDown, ShieldAlert, Siren } from "lucide-react";
import type { Notif, Activite } from "@/lib/dispensaire-notifications";
import { ETAT_ACTIFS, ETAT_LABEL, type Etat } from "@/lib/erp-assistant-const";
import { setEtatNotif } from "@/app/dispensaire/assistant/actions";
import { PremiumCard, SectionHeader, PriorityBadge, EmptyState } from "@/components/dispensaire-premium";

// Centre de notifications PREMIUM — priorités visuelles (badges), cartes en verre,
// filtres par sévérité, actions inline (en cours / résolue / archiver / rouvrir),
// activité récente. Toute la logique d'état (overlay persistant) est conservée.

const TONE: Record<Notif["severite"], string> = { alerte: "var(--crit)", attention: "var(--warn)", info: "var(--accent)" };
const PRIO: Record<Notif["severite"], "critique" | "important" | "info"> = { alerte: "critique", attention: "important", info: "info" };
const SEV_ICON: Record<Notif["severite"], typeof AlertTriangle> = { alerte: ShieldAlert, attention: AlertTriangle, info: Info };

const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const ACT: Record<Activite["genre"], { icon: typeof ArrowUpRight; tone: string }> = {
  entree: { icon: ArrowUpRight, tone: "var(--good)" },
  sortie: { icon: ArrowDownRight, tone: "var(--crit)" },
  deplacement: { icon: ArrowLeftRight, tone: "var(--warn)" },
  coffre: { icon: Archive, tone: "var(--accent)" },
};

const estActive = (n: Notif) => ETAT_ACTIFS.includes(n.etat || "nouveau");

type Filtre = "tous" | Notif["severite"];

export function DispensaireNotifications({ items, activite = [] }: { items: Notif[]; activite?: Activite[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [voirTraitees, setVoirTraitees] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("tous");

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

  // Décompte par sévérité pour les puces de filtre.
  const compte = (s: Notif["severite"]) => actives.filter((n) => n.severite === s).length;
  const nAlerte = compte("alerte"), nAttention = compte("attention"), nInfo = compte("info");
  const critiques = actives.filter((n) => n.severite === "alerte" && n.escalade === "police");

  const groupes: { cle: Notif["severite"]; label: string }[] = [
    { cle: "alerte", label: "Alertes" },
    { cle: "attention", label: "À traiter" },
    { cle: "info", label: "Informations" },
  ];
  const groupesVisibles = filtre === "tous" ? groupes : groupes.filter((g) => g.cle === filtre);

  const filtres: { cle: Filtre; label: string; n: number; tone?: string }[] = [
    { cle: "tous", label: "Tout", n: actives.length },
    { cle: "alerte", label: "Alertes", n: nAlerte, tone: TONE.alerte },
    { cle: "attention", label: "À traiter", n: nAttention, tone: TONE.attention },
    { cle: "info", label: "Infos", n: nInfo, tone: TONE.info },
  ];

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        eyebrow="Temps réel"
        titre="Centre de notifications"
        sous={actives.length ? `${actives.length} en attente de traitement` : "Tout est à jour"}
        icon={Bell}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {filtres.map((f) => {
              const on = filtre === f.cle;
              return (
                <button key={f.cle} type="button" onClick={() => setFiltre(f.cle)} disabled={f.cle !== "tous" && f.n === 0}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition disabled:opacity-40"
                  style={on ? { color: "#fff", background: f.tone || "var(--accent)", borderColor: "transparent" } : { color: "var(--muted)", borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  {f.tone ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : f.tone }} /> : null}
                  {f.label} <span className="font-num opacity-80">{f.n}</span>
                </button>
              );
            })}
          </div>
        }
      />

      {/* Bandeau d'escalade forte (dossiers police) — priorité maximale */}
      {critiques.length ? (
        <div className="disp-urgent flex items-center gap-3 rounded-[14px] border px-4 py-3" style={{ borderColor: "color-mix(in srgb,var(--crit) 45%,transparent)", background: "color-mix(in srgb,var(--crit) 10%,transparent)" }}>
          <Siren className="h-5 w-5 shrink-0" style={{ color: "var(--crit)" }} />
          <div className="min-w-0 flex-1 text-[0.84rem]"><b>{critiques.length}</b> dossier(s) en escalade forte — impayés déjà relancés, transmission police proposée.</div>
          <PriorityBadge tone="urgence" pulse>Urgence</PriorityBadge>
        </div>
      ) : null}

      {actives.length === 0 ? (
        <EmptyState icon={Check} titre="Rien à signaler" sous="Toutes les notifications ont été traitées — le dispensaire tourne rond." />
      ) : groupesVisibles.map((g) => {
        const list = actives.filter((n) => n.severite === g.cle);
        if (!list.length) return null;
        const Icon = SEV_ICON[g.cle];
        return (
          <section key={g.cle}>
            <div className="mb-2 flex items-center gap-2 text-[0.74rem] font-semibold uppercase tracking-[0.05em]" style={{ color: TONE[g.cle] }}>
              <Icon className="h-3.5 w-3.5" /> {g.label} <span className="font-num">({list.length})</span>
            </div>
            <div className="flex flex-col gap-2">
              {list.map((n) => {
                const NIcon = SEV_ICON[n.severite];
                return (
                  <PremiumCard key={n.id} lift={false} className="overflow-hidden" style={{ borderColor: `color-mix(in srgb,${TONE[n.severite]} 32%,var(--border))` }}>
                    <Link href={n.href} className="group flex items-center gap-3 p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb,${TONE[n.severite]} 14%,transparent)` }}><NIcon className="h-4 w-4" style={{ color: TONE[n.severite] }} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                          <PriorityBadge tone={n.escalade === "police" ? "urgence" : PRIO[n.severite]}>{n.type}</PriorityBadge>
                          {n.etat === "en_cours" ? <span className="text-[0.66rem] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--warn)" }}>· en cours</span> : null}
                        </div>
                        <div className="truncate text-[0.86rem]">{n.texte}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5" />
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-1.5" style={{ borderColor: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
                      {n.etat !== "en_cours" && (
                        <ActionBtn onClick={() => marquer(n.id, "en_cours")} disabled={busy === n.id} icon={Clock} tone="var(--warn)">En cours</ActionBtn>
                      )}
                      <ActionBtn onClick={() => marquer(n.id, "resolu")} disabled={busy === n.id} icon={Check} tone="var(--good)">Résolue</ActionBtn>
                      <ActionBtn onClick={() => marquer(n.id, "archive")} disabled={busy === n.id} icon={Archive} tone="var(--muted)">Archiver</ActionBtn>
                    </div>
                  </PremiumCard>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Notifications traitées (résolues / archivées) — repliées, réouvrables. */}
      {traitees.length ? (
        <section>
          <button type="button" onClick={() => setVoirTraitees((v) => !v)} className="mb-2 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em] text-faint transition hover:text-muted">
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
          <div className="mb-2 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em] text-faint"><History className="h-3.5 w-3.5" /> Activité récente <span className="font-num">({activite.length})</span></div>
          <PremiumCard lift={false} className="overflow-hidden">
            <div className="flex flex-col divide-y" style={{ borderColor: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
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
          </PremiumCard>
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
