import Link from "next/link";
import { Bell, AlertTriangle, Info, ArrowRight, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Archive, History } from "lucide-react";
import type { Notif, Activite } from "@/lib/dispensaire-notifications";

const TONE: Record<Notif["severite"], string> = { alerte: "var(--oxblood)", attention: "var(--warn)", info: "var(--accent)" };

const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const ACT: Record<Activite["genre"], { icon: typeof ArrowUpRight; tone: string }> = {
  entree: { icon: ArrowUpRight, tone: "var(--good)" },
  sortie: { icon: ArrowDownRight, tone: "var(--oxblood)" },
  deplacement: { icon: ArrowLeftRight, tone: "var(--warn)" },
  coffre: { icon: Archive, tone: "var(--accent)" },
};

export function DispensaireNotifications({ items, activite = [] }: { items: Notif[]; activite?: Activite[] }) {
  const groupes: { cle: Notif["severite"]; label: string }[] = [
    { cle: "alerte", label: "Alertes" },
    { cle: "attention", label: "À traiter" },
    { cle: "info", label: "Informations" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-accent" /><h2 className="font-display text-[1.15rem]">Notifications</h2><span className="font-num text-[0.85rem] text-faint">{items.length}</span></div>

      {items.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
          <Info className="mx-auto h-6 w-6 text-faint" />
          <p className="mt-2 text-[0.9rem] text-muted">Rien à signaler — tout est à jour.</p>
        </div>
      ) : groupes.map((g) => {
        const list = items.filter((n) => n.severite === g.cle);
        if (!list.length) return null;
        return (
          <section key={g.cle}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em]" style={{ color: TONE[g.cle] }}>
              {g.cle === "info" ? <Info className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {g.label} <span className="font-num">({list.length})</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {list.map((n) => (
                <Link key={n.id} href={n.href} className="group flex items-center gap-3 rounded-[12px] border bg-surface-2 p-3 transition hover:border-border-2" style={{ borderColor: `color-mix(in srgb,${TONE[n.severite]} 35%,var(--border))` }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb,${TONE[n.severite]} 14%,transparent)` }}><AlertTriangle className="h-4 w-4" style={{ color: TONE[n.severite] }} /></span>
                  <div className="min-w-0 flex-1"><div className="text-[0.7rem] uppercase tracking-[0.04em] text-faint">{n.type}</div><div className="truncate text-[0.86rem]">{n.texte}</div></div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}

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
