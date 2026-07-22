import Link from "next/link";
import { Bell, AlertTriangle, Info, ArrowRight } from "lucide-react";
import type { Notif } from "@/lib/dispensaire-notifications";

const TONE: Record<Notif["severite"], string> = { alerte: "var(--oxblood)", attention: "var(--warn)", info: "var(--accent)" };

export function DispensaireNotifications({ items }: { items: Notif[] }) {
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
    </div>
  );
}
